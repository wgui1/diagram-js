import { Injector } from 'didi';

import CoreModule from './core';

import Matter from 'matter-js';


/**
 * Bootstrap an injector from a list of modules, instantiating a number of default components
 *
 * @ignore
 * @param {Array<didi.Module>} bootstrapModules
 *
 * @return {didi.Injector} a injector to use to access the components
 */
function bootstrap(bootstrapModules) {

  var modules = [],
      components = [];

  function hasModule(m) {
    return modules.indexOf(m) >= 0;
  }

  function addModule(m) {
    modules.push(m);
  }

  function visit(m) {
    if (hasModule(m)) {
      return;
    }

    (m.__depends__ || []).forEach(visit);

    if (hasModule(m)) {
      return;
    }

    addModule(m);

    (m.__init__ || []).forEach(function(c) {
      components.push(c);
    });
  }

  bootstrapModules.forEach(visit);

  var injector = new Injector(modules);

  components.forEach(function(c) {

    try {

      // eagerly resolve component (fn or string)
      injector[typeof c === 'string' ? 'get' : 'invoke'](c);
    } catch (e) {
      console.error('Failed to instantiate component');
      console.error(e.stack);

      throw e;
    }
  });

  return injector;
}

/**
 * Creates an injector from passed options.
 *
 * @ignore
 * @param  {Object} options
 * @return {didi.Injector}
 */
function createInjector(options) {

  options = options || {};

  var configModule = {
    'config': ['value', options]
  };

  var modules = [ configModule, CoreModule ].concat(options.modules || []);

  return bootstrap(modules);
}


/**
 * The main diagram-js entry point that bootstraps the diagram with the given
 * configuration.
 *
 * To register extensions with the diagram, pass them as Array<didi.Module> to the constructor.
 *
 * @class djs.Diagram
 * @memberOf djs
 * @constructor
 *
 * @example
 *
 * <caption>Creating a plug-in that logs whenever a shape is added to the canvas.</caption>
 *
 * // plug-in implemenentation
 * function MyLoggingPlugin(eventBus) {
 *   eventBus.on('shape.added', function(event) {
 *     console.log('shape ', event.shape, ' was added to the diagram');
 *   });
 * }
 *
 * // export as module
 * export default {
 *   __init__: [ 'myLoggingPlugin' ],
 *     myLoggingPlugin: [ 'type', MyLoggingPlugin ]
 * };
 *
 *
 * // instantiate the diagram with the new plug-in
 *
 * import MyLoggingModule from 'path-to-my-logging-plugin';
 *
 * var diagram = new Diagram({
 *   modules: [
 *     MyLoggingModule
 *   ]
 * });
 *
 * diagram.invoke([ 'canvas', function(canvas) {
 *   // add shape to drawing canvas
 *   canvas.addShape({ x: 10, y: 10 });
 * });
 *
 * // 'shape ... was added to the diagram' logged to console
 *
 * @param {Object} options
 * @param {Array<didi.Module>} [options.modules] external modules to instantiate with the diagram
 * @param {didi.Injector} [injector] an (optional) injector to bootstrap the diagram with
 */
export default function Diagram(options, injector) {

  // create injector unless explicitly specified
  this.injector = injector = injector || createInjector(options);

  // API

  /**
   * Resolves a diagram service
   *
   * @method Diagram#get
   *
   * @param {String} name the name of the diagram service to be retrieved
   * @param {Boolean} [strict=true] if false, resolve missing services to null
   */
  this.get = injector.get;

  /**
   * Executes a function into which diagram services are injected
   *
   * @method Diagram#invoke
   *
   * @param {Function|Object[]} fn the function to resolve
   * @param {Object} locals a number of locals to use to resolve certain dependencies
   */
  this.invoke = injector.invoke;

  // init

  // indicate via event


  /**
   * An event indicating that all plug-ins are loaded.
   *
   * Use this event to fire other events to interested plug-ins
   *
   * @memberOf Diagram
   *
   * @event diagram.init
   *
   * @example
   *
   * eventBus.on('diagram.init', function() {
   *   eventBus.fire('my-custom-event', { foo: 'BAR' });
   * });
   *
   * @type {Object}
   */
  this.get('eventBus').fire('diagram.init');

  window.initPhysics = function(debugMode) {

    window.physicsBodiesByShapeID = {};

    if (window.prevEngine) {
      Matter.World.clear(window.prevEngine.world);
      Matter.Engine.clear(window.prevEngine);
      delete window.prevEngine;
    }
    if (window.prevRender) {
      Matter.Render.stop(window.prevRender);
      delete window.prevRender;
    }

    var root = document.getElementById('root');
    root.style.position = 'absolute';
    var diagramDiv = document.getElementsByClassName('diagram')[0];
    var width = diagramDiv.clientWidth;
    var height = diagramDiv.clientHeight;

    var Engine = Matter.Engine,
        Render = Matter.Render,
        World = Matter.World,
        Bodies = Matter.Bodies;

    var engine = Engine.create();
    window.prevEngine = engine;
    var render;
    if (debugMode){
      render = Render.create({
        element: document.body,
        engine: engine,
        options: {
            width: width,
            height: height,
            wireframes: false
        }
      });
      window.prevRender = render;
    }

    window.addRectangle = function(x, y, width, height, isStatic, rotation) {
      var box = Bodies.rectangle(x, y, width, height , { isStatic: isStatic });
      Matter.Body.rotate(box, 0.0174533 * rotation);
      World.add(engine.world, box);
      return box;
    }

    window.addCircle = function(x, y, radius, isStatic, rotation) {
      var circle = Bodies.circle(x, y, radius, { isStatic: isStatic });
      Matter.Body.rotate(circle, 0.0174533 * rotation);
      World.add(engine.world, circle);
      return circle;
    }

    var handleConnection = function(connection) {
      for (var i = 0; i < connection.waypoints.length - 1; i ++) {
        var p1 = connection.waypoints[i];
        var p2 = connection.waypoints[i + 1];
        var centerX = (p1.x + p2.x) / 2;
        var centerY = (p1.y + p2.y) / 2;
        var diffX = Math.abs(p1.x - p2.x);
        var diffY = Math.abs(p1.y - p2.y);
        if (diffX == 0){
          diffX = 10;
        }
        if (diffY == 0){
          diffY = 10;
        }
        var physics = addRectangle(centerX, centerY, diffX, diffY, true, 0);
      }
    }

    var handleShape = function(shape) {
      var type = shape.type;
      if (!shape.getGraphics) {
        return;
      }
      if (shape.type == 'bpmn:Process'){
        return;
      }
      var graphics = shape.getGraphics();
      var isCircle = type.includes('Event');
      if (!isCircle) {
        var rectPhysics = addRectangle(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width, shape.height, shape.isStatic, shape.rotation);
        shape.physicsBody = rectPhysics;
        rectPhysics.diagramShape = shape;
        window.physicsBodiesByShapeID[shape.id] = rectPhysics;
        console.log(rectPhysics);
      } else {
        var circlPhysics = addCircle(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width/2, shape.isStatic, shape.rotation);
        shape.physicsBody = circlPhysics;
        circlPhysics.diagramShape = shape;
        window.physicsBodiesByShapeID[shape.id] = circlPhysics;
        console.log(circlPhysics);
      }
    }

    eventBus.on('shape.added', function(event) {
      var shape = event.element;
      handleShape(shape);
    });

    Engine.run(engine);
    if (debugMode){
      Render.run(render);
    }

    if (debugMode) {
      window.canvas = document.getElementsByTagName('canvas')[0];
      window.canvas.style.position = 'absolute';
      window.canvas.style.background = "rgba(0, 0, 0, 0)";
      var offs = getOffset(diagramDiv);
      window.canvas.style.top = offs.top + 'px';
      window.canvas.style.left = offs.left + 'px';
      window.canvas.style.opacity = '0.5';
    }

    var allShapes = elementRegistry.getAll();
    for (var i = 0; i < allShapes.length; i ++) {
      handleShape(allShapes[i]);
      if (allShapes[i].waypoints) {
        handleConnection(allShapes[i]);
      }
    }

    requestAnimationFrame(updatePhysics);
  }

}

function updatePhysics() {
  for (var shapeID in window.physicsBodiesByShapeID) {
    var physicsBody = window.physicsBodiesByShapeID[shapeID];
    var shape = physicsBody.diagramShape;
    shape.setCenterPosition(physicsBody.position.x, physicsBody.position.y);
    shape.setRotation(physicsBody.angle * 57.2958);
  }
  requestAnimationFrame(updatePhysics);
}

function getOffset(el) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY
  };
}

/**
 * Destroys the diagram
 *
 * @method  Diagram#destroy
 */
Diagram.prototype.destroy = function() {
  this.get('eventBus').fire('diagram.destroy');
};

/**
 * Clear the diagram, removing all contents.
 */
Diagram.prototype.clear = function() {
  this.get('eventBus').fire('diagram.clear');
};
