package lila.simul

import akka.actor._
import play.api.libs.iteratee._
import play.api.libs.json._
import scala.concurrent.duration._

import actorApi._
import lila.common.LightUser
import lila.hub.TimeBomb
import lila.memo.ExpireSetMemo
import lila.socket.actorApi.{ Connected => _, _ }
import lila.socket.{ SocketActor, History, Historical }

private[simul] final class Socket(
    simulId: String,
    val history: History[Messadata],
    getSimul: Simul.ID => Fu[Option[Simul]],
    jsonView: JsonView,
    lightUser: String => Option[LightUser],
    uidTimeout: Duration,
    socketTimeout: Duration) extends SocketActor[Member](uidTimeout) with Historical[Member, Messadata] {

  private val timeBomb = new TimeBomb(socketTimeout)

  private var delayedCrowdNotification = false
  private var delayedReloadNotification = false

  private def redirectPlayer(game: lila.game.Game, color: chess.Color) {
    val player = game player color
    player.userId flatMap memberByUserId foreach { member =>
      notifyMember("redirect", game fullIdOf player.color)(member)
    }
  }

  def receiveSpecific = {

    case StartGame(game)       => redirectPlayer(game, chess.Black)

    case StartSimul(firstGame) => redirectPlayer(firstGame, chess.White)

    case Reload                => notifyReload

    case Aborted               => notifyVersion("aborted", Json.obj(), Messadata())

    case PingVersion(uid, v) => {
      ping(uid)
      timeBomb.delay
      withMember(uid) { m =>
        history.since(v).fold(resync(m))(_ foreach sendMessage(m))
      }
    }

    case Broom => {
      broom
      if (timeBomb.boom) self ! PoisonPill
    }

    case lila.chat.actorApi.ChatLine(_, line) => line match {
      case line: lila.chat.UserLine =>
        notifyVersion("message", lila.chat.Line toJson line, Messadata(line.troll))
      case _ =>
    }

    case GetVersion => sender ! history.version

    case Join(uid, user, version) =>
      val (enumerator, channel) = Concurrent.broadcast[JsValue]
      val member = Member(channel, user)
      addMember(uid, member)
      notifyCrowd
      sender ! Connected(enumerator, member)

    case Quit(uid) =>
      quit(uid)
      notifyCrowd

    case NotifyCrowd =>
      delayedCrowdNotification = false
      val (anons, users) = members.values.map(_.userId flatMap lightUser).foldLeft(0 -> List[LightUser]()) {
        case ((anons, users), Some(user)) => anons -> (user :: users)
        case ((anons, users), None)       => (anons + 1) -> users
      }
      notifyVersion("crowd", showSpectators(users, anons), Messadata())

    case NotifyReload =>
      delayedReloadNotification = false
      getSimul(simulId) foreach {
        _ foreach { simul =>
          jsonView(simul) foreach { obj =>
            notifyVersion("reload", obj, Messadata())
          }
        }
      }
  }

  def notifyCrowd {
    if (!delayedCrowdNotification) {
      delayedCrowdNotification = true
      context.system.scheduler.scheduleOnce(500 millis, self, NotifyCrowd)
    }
  }

  def notifyReload {
    if (!delayedReloadNotification) {
      delayedReloadNotification = true
      // keep the delay low for immediate response to join/withdraw,
      // but still debounce to avoid tourney start message rush
      context.system.scheduler.scheduleOnce(50 millis, self, NotifyReload)
    }
  }

  protected def shouldSkipMessageFor(message: Message, member: Member) =
    message.metadata.trollish && !member.troll
}
