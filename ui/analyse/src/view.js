var m = require('mithril');
var chessground = require('chessground');
var classSet = require('chessground').util.classSet;
var game = require('game').game;
var partial = require('chessground').util.partial;
var renderStatus = require('game').view.status;
var mod = require('game').view.mod;
var treePath = require('./path');
var control = require('./control');
var actionMenu = require('./actionMenu').view;
var renderPromotion = require('./promotion').view;

function renderEval(e) {
  e = Math.round(e / 10) / 10;
  return (e > 0 ? '+' : '') + e;
}

function renderEvalTag(e) {
  return {
    tag: 'span',
    attrs: {
      class: 'eval'
    },
    children: [e]
  };
}

function autoScroll(movelist) {
  var plyEl = movelist.querySelector('.active');
  if (plyEl) movelist.scrollTop = plyEl.offsetTop - movelist.offsetHeight / 2 + plyEl.offsetHeight / 2;
}

var emptyMove = m('em.move.empty', '...');

function renderMove(ctrl, move, path) {
  if (!move) return emptyMove;
  var pathStr = treePath.write(path);
  return {
    tag: 'a',
    attrs: {
      class: 'move' + (pathStr === ctrl.vm.pathStr ? ' active' : ''),
      'data-path': pathStr,
      'href': '#' + path[0].ply
    },
    children: [
      move.eval ? renderEvalTag(renderEval(move.eval)) : (
        move.mate ? renderEvalTag('#' + move.mate) : null
      ),
      move.san
    ]
  };
}

function plyToTurn(ply) {
  return Math.floor((ply - 1) / 2) + 1;
}

function renderVariation(ctrl, variation, path, border) {
  return m('div', {
    class: 'variation' + (border ? ' border' : '')
  }, renderVariationContent(ctrl, variation, path));
}

function renderVariationNested(ctrl, variation, path) {
  return m('span.variation', [
    '(',
    renderVariationContent(ctrl, variation, path),
    ')'
  ]);
}

function renderVariationContent(ctrl, variation, path) {
  var turns = [];
  if (variation[0].ply % 2 === 0) {
    variation = variation.slice(0);
    var move = variation.shift();
    turns.push({
      turn: plyToTurn(move.ply),
      black: move
    });
  }
  for (i = 0, nb = variation.length; i < nb; i += 2) turns.push({
    turn: plyToTurn(variation[i].ply),
    white: variation[i],
    black: variation[i + 1]
  });
  return turns.map(function(turn) {
    return renderVariationTurn(ctrl, turn, path);
  });
}

function renderVariationMeta(ctrl, move, path) {
  if (!move || !move.variations.length) return;
  return move.variations.map(function(variation, i) {
    return renderVariationNested(ctrl, variation, treePath.withVariation(path, i + 1));
  });
}

function renderVariationTurn(ctrl, turn, path) {
  var wPath = turn.white ? treePath.withPly(path, turn.white.ply) : null;
  var wMove = wPath ? renderMove(ctrl, turn.white, wPath) : null;
  var wMeta = renderVariationMeta(ctrl, turn.white, wPath);
  var bPath = turn.black ? treePath.withPly(path, turn.black.ply) : null;
  var bMove = bPath ? renderMove(ctrl, turn.black, bPath) : null;
  var bMeta = renderVariationMeta(ctrl, turn.black, bPath);
  if (wMove) {
    if (wMeta) return [
      renderIndex(turn.turn + '.'),
      wMove,
      wMeta,
      bMove ? [
        bMove,
        bMeta
      ] : null
    ];
    return [renderIndex(turn.turn + '.'), wMove, (bMove ? [' ', bMove, bMeta] : '')];
  }
  return [renderIndex(turn.turn + '...'), bMove, bMeta];
}

function renderOpening(ctrl, opening) {
  return m('div.comment.opening', opening.code + ': ' + opening.name);
}

function renderMeta(ctrl, move, path) {
  if (!ctrl.vm.comments) return;
  var opening = ctrl.data.game.opening;
  opening = (move && opening && opening.size == move.ply) ? renderOpening(ctrl, opening) : null;
  if (!move || (!opening && !move.comments.length && !move.variations.length)) return;
  var children = [];
  if (opening) children.push(opening);
  if (move.comments.length) move.comments.forEach(function(comment) {
    children.push(m('div.comment', comment));
  });
  var border = children.length === 0;
  if (move.variations.length) move.variations.forEach(function(variation, i) {
    children.push(renderVariation(ctrl, variation, treePath.withVariation(path, i + 1), border));
    border = false;
  });
  return children;
}

function renderIndex(txt) {
  return {
    tag: 'span',
    attrs: {
      class: 'index'
    },
    children: [txt]
  };
}

function renderTurnDiv(children) {
  return {
    tag: 'div',
    attrs: {
      class: 'turn',
    },
    children: children
  };
}

function renderTurn(ctrl, turn, path) {
  var index = renderIndex(turn.turn);
  var wPath = turn.white ? treePath.withPly(path, turn.white.ply) : null;
  var wMove = wPath ? renderMove(ctrl, turn.white, wPath) : null;
  var wMeta = renderMeta(ctrl, turn.white, wPath);
  var bPath = turn.black ? treePath.withPly(path, turn.black.ply) : null;
  var bMove = bPath ? renderMove(ctrl, turn.black, bPath) : null;
  var bMeta = renderMeta(ctrl, turn.black, bPath);
  if (wMove) {
    if (wMeta) return [
      renderTurnDiv([index, wMove, emptyMove]),
      wMeta,
      bMove ? [
        renderTurnDiv([index, emptyMove, bMove]),
        bMeta
      ] : null,
    ];
    return [
      renderTurnDiv([index, wMove, bMove]),
      bMeta
    ];
  }
  return [
    renderTurnDiv([index, emptyMove, bMove]),
    bMeta
  ];
}

function renderTree(ctrl, tree) {
  var turns = [];
  for (i = 0, nb = tree.length; i < nb; i += 2) turns.push({
    turn: Math.floor(i / 2) + 1,
    white: tree[i],
    black: tree[i + 1]
  });
  var path = treePath.default();
  return turns.map(function(turn) {
    return renderTurn(ctrl, turn, path);
  });
}

function renderAnalyse(ctrl) {
  var result;
  if (ctrl.data.game.status.id >= 30) switch (ctrl.data.game.winner) {
    case 'white':
      result = '1-0';
      break;
    case 'black':
      result = '0-1';
      break;
    default:
      result = '½-½';
  }
  var tree = renderTree(ctrl, ctrl.analyse.tree);
  if (result) {
    tree.push(m('div.result', result));
    var winner = game.getPlayer(ctrl.data, ctrl.data.game.winner);
    tree.push(m('div.status', [
      renderStatus(ctrl),
      winner ? ', ' + ctrl.trans(winner.color == 'white' ? 'whiteIsVictorious' : 'blackIsVictorious') : null
    ]));
  }
  return m('div.analyse', {
      onmousedown: function(e) {
        var path = e.target.getAttribute('data-path') || e.target.parentNode.getAttribute('data-path');
        if (path) {
          e.preventDefault();
          ctrl.userJump(treePath.read(path));
        }
      },
      onclick: function(e) {
        return false;
      }
    },
    tree);
}

function wheel(ctrl, e) {
  if (e.deltaY > 0) control.next(ctrl);
  else if (e.deltaY < 0) control.prev(ctrl);
  m.redraw();
  e.preventDefault();
  return false;
}

function visualBoard(ctrl) {
  return m('div.lichess_board_wrap',
    m('div.lichess_board.' + ctrl.data.game.variant.key, {
        config: function(el, isUpdate) {
          if (!isUpdate) el.addEventListener('wheel', function(e) {
            return wheel(ctrl, e);
          });
        }
      },
      chessground.view(ctrl.chessground), renderPromotion(ctrl)));
}

function blindBoard(ctrl) {
  return m('div.lichess_board_blind', [
    m('div.textual', {
      config: function(el, isUpdate) {
        if (!isUpdate) blind.init(el, ctrl);
      }
    }),
    chessground.view(ctrl.chessground)
  ]);
}

function buttons(ctrl) {
  return [
    m('div.game_control', [
      m('div.jumps.hint--bottom', [
        ['first', 'W', control.first, ],
        ['prev', 'Y', control.prev],
        ['next', 'X', control.next],
        ['last', 'V', control.last]
      ].map(function(b) {
        return {
          tag: 'a',
          attrs: {
            class: 'button ' + b[0] + ' ' + classSet({
              disabled: ctrl.broken,
              glowing: ctrl.vm.late && b[0] === 'last'
            }),
            'data-icon': b[1],
            onclick: partial(b[2], ctrl)
          }
        };
      })),
      ctrl.data.inGame ? null : m('a.button', {
        onclick: ctrl.actionMenu.toggle,
        class: ctrl.actionMenu.open ? 'active' : ''
      }, m('span', {
        'data-icon': '['
      }))
    ])
  ];
}

module.exports = function(ctrl) {
  return [
    m('div.top', [
      m('div.lichess_game', {
        config: function(el, isUpdate, context) {
          if (isUpdate) return;
          $('body').trigger('lichess.content_loaded');
        }
      }, [
        ctrl.data.blind ? blindBoard(ctrl) : visualBoard(ctrl),
        m('div.lichess_ground',
          ctrl.actionMenu.open ? actionMenu(ctrl) : m('div.replay', {
              config: function(el, isUpdate) {
                autoScroll(el);
                if (!isUpdate) setTimeout(partial(autoScroll, el), 100);
              }
            },
            renderAnalyse(ctrl)), buttons(ctrl))
      ])
    ]),
    m('div.underboard', [
      m('div.center'),
      m('div.right')
    ])
  ];
};
