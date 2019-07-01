import {
  assign,
  filter,
  groupBy,
  isObject
} from 'min-dash';

var LOW_PRIORITY = 500;

import { getOriginal as getOriginalEvent } from '../../util/Event';

var round = Math.round;

function mid(element) {
  return {
    x: element.x + round(element.width / 2),
    y: element.y + round(element.height / 2)
  };
}

/**
 * A plugin that makes shapes draggable / droppable.
 *
 * @param {EventBus} eventBus
 * @param {Dragging} dragging
 * @param {Modeling} modeling
 * @param {Selection} selection
 * @param {Rules} rules
 */
export default function MoveEvents(
    eventBus, dragging, modeling,
    selection, rules) {

  var self = this;

  this._selection = selection;
  this._rules = rules;

  // move events

  // assign a low priority to this handler
  // to let others modify the move event before we update
  // the context
  //
  eventBus.on('shape.move.move', LOW_PRIORITY, function(event) {

    var context = event.context,
        validatedShapes = context.validatedShapes,
        hover = event.hover,
        delta = { x: event.dx, y: event.dy },
        position = { x: event.x, y: event.y },
        canExecute;

    // check if we can move the elements
    canExecute = self.canMove(validatedShapes, delta, position, hover);

    context.delta = delta;
    context.canExecute = canExecute;

    // simply ignore move over
    if (canExecute === null) {
      context.target = null;

      return;
    }

    context.target = hover;
  });

  eventBus.on('shape.move.end', function(event) {

    var context = event.context;

    var delta = context.delta,
        canExecute = context.canExecute,
        isAttach = canExecute === 'attach',
        shapes = context.shapes;

    if (canExecute === false) {
      return false;
    }

    // ensure we have actual pixel values deltas
    // (important when zoom level was > 1 during move)
    delta.x = round(delta.x);
    delta.y = round(delta.y);

    if (delta.x === 0 && delta.y === 0) {

      // didn't move
      return;
    }

    modeling.moveElements(shapes, delta, context.target, {
      primaryShape: context.shape,
      attach: isAttach
    });
  });


  // move activation

  eventBus.on('element.mousedown', function(event) {

    var originalEvent = getOriginalEvent(event);

    if (!originalEvent) {
      throw new Error('must supply DOM mousedown event');
    }

    return start(originalEvent, event.element);
  });

  /**
   * Start move.
   *
   * @param {MouseEvent} event
   * @param {djs.model.Shape} shape
   * @param {boolean} [activate]
   * @param {Object} [context]
   */
  function start(event, element, activate, context) {
    if (isObject(activate)) {
      context = activate;
      activate = false;
    }

    var shapes = self.getValidatedShapes(element),
        canExecute = self.canMove(shapes);

    // do nothing if movement is not allowed from the beginning
    if (!canExecute) {
      return;
    }

    context = self.initContext(context, canExecute, shapes, element);

    var referencePoint = mid(element);

    dragging.init(event, referencePoint, 'shape.move', {
      cursor: 'grabbing',
      autoActivate: activate,
      data: {
        shape: element,
        context: context
      }
    });

    // we've handled the event
    return true;
  }

  // API

  this.start = start;
}

MoveEvents.$inject = [
  'eventBus',
  'dragging',
  'modeling',
  'selection',
  'rules'
];

/**
 * Get validated shapes out of selection or the dragged shape if it is not selected.
 *
 * @param {djs.model.Base} shape - moved shape
 */
MoveEvents.prototype.getValidatedShapes = function(shape) {
  var shapes = this._selection.get().slice();

  // move only single shape if the dragged element
  // is not part of the current selection
  if (shapes.indexOf(shape) === -1) {
    shapes = [ shape ];
  }

  // ensure we remove nested elements in the collection
  // and add attachers for a proper dragger
  shapes = removeNested(shapes);

  return shapes;
};

/**
 * Create or initialize move context without changing the reference.
 *
 * This sets up the context with
 *  * canExecute: value returned via rules
 *  * shape: the primary shape being moved
 *  * shapes: a list of shapes to be moved
 *  * validatedShapes: a list of shapes that were checked
 *    against the rules before and during move
 *
 * @param {object|undefined} context
 * @param {boolean} canExecute
 * @param {Array<djs.model.Base>} shapes - moved shapes
 * @param {djs.model.Base} element - dragged shape
 */
MoveEvents.prototype.initContext = function(context, canExecute, shapes, element) {
  context = context || {};

  assign(context, {
    canExecute: canExecute,
    shapes: shapes,
    validatedShapes: shapes,
    shape: element
  });

  return context;
};

MoveEvents.prototype.canMove = function(shapes, delta, position, target) {
  return this._rules.allowed('elements.move', {
    shapes: shapes,
    delta: delta,
    position: position,
    target: target
  });
};

/**
 * Return a filtered list of elements that do not contain
 * those nested into others.
 *
 * @param  {Array<djs.model.Base>} elements
 *
 * @return {Array<djs.model.Base>} filtered
 */
function removeNested(elements) {

  var ids = groupBy(elements, 'id');

  return filter(elements, function(element) {
    while ((element = element.parent)) {

      // parent in selection
      if (ids[element.id]) {
        return false;
      }
    }

    return true;
  });
}
