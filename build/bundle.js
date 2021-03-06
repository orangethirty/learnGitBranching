(function(){
var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/node_modules/underscore/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/underscore/underscore.js",function(require,module,exports,__dirname,__filename,process,global){//     Underscore.js 1.4.3
//     http://underscorejs.org
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var push             = ArrayProto.push,
      slice            = ArrayProto.slice,
      concat           = ArrayProto.concat,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.4.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // with specific `key:value` pairs.
  _.where = function(obj, attrs) {
    if (_.isEmpty(attrs)) return [];
    return _.filter(obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See: https://bugs.webkit.org/show_bug.cgi?id=80797
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value || _.identity);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    each(input, function(value) {
      if (_.isArray(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(concat.apply(ArrayProto, arguments));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(args, "" + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function(func, context) {
    var args, bound;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, result;
    var previous = 0;
    var later = function() {
      previous = new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] == null) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent, but `Object`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                               _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
        return false;
      }
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(n);
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + (0 | Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = '' + ++idCounter;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      var render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

});

require.define("/node_modules/backbone/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"backbone.js"}
});

require.define("/node_modules/backbone/backbone.js",function(require,module,exports,__dirname,__filename,process,global){//     Backbone.js 0.9.9

//     (c) 2010-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(){

  // Initial Setup
  // -------------

  // Save a reference to the global object (`window` in the browser, `exports`
  // on the server).
  var root = this;

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create a local reference to array methods.
  var array = [];
  var push = array.push;
  var slice = array.slice;
  var splice = array.splice;

  // The top-level namespace. All public Backbone classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
  var Backbone;
  if (typeof exports !== 'undefined') {
    Backbone = exports;
  } else {
    Backbone = root.Backbone = {};
  }

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '0.9.9';

  // Require Underscore, if we're on the server, and it's not already present.
  var _ = root._;
  if (!_ && (typeof require !== 'undefined')) _ = require('underscore');

  // For Backbone's purposes, jQuery, Zepto, or Ender owns the `$` variable.
  Backbone.$ = root.jQuery || root.Zepto || root.ender;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Backbone.Events
  // ---------------

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Implement fancy features of the Events API such as multiple event
  // names `"change blur"` and jQuery-style event maps `{change: action}`
  // in terms of the existing API.
  var eventsApi = function(obj, action, name, rest) {
    if (!name) return true;
    if (typeof name === 'object') {
      for (var key in name) {
        obj[action].apply(obj, [key, name[key]].concat(rest));
      }
    } else if (eventSplitter.test(name)) {
      var names = name.split(eventSplitter);
      for (var i = 0, l = names.length; i < l; i++) {
        obj[action].apply(obj, [names[i]].concat(rest));
      }
    } else {
      return true;
    }
  };

  // Optimized internal dispatch function for triggering events. Tries to
  // keep the usual cases speedy (most Backbone events have 3 arguments).
  var triggerEvents = function(obj, events, args) {
    var ev, i = -1, l = events.length;
    switch (args.length) {
    case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx);
    return;
    case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, args[0]);
    return;
    case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, args[0], args[1]);
    return;
    case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, args[0], args[1], args[2]);
    return;
    default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
    }
  };

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {

    // Bind one or more space separated events, or an events map,
    // to a `callback` function. Passing `"all"` will bind the callback to
    // all events fired.
    on: function(name, callback, context) {
      if (!(eventsApi(this, 'on', name, [callback, context]) && callback)) return this;
      this._events || (this._events = {});
      var list = this._events[name] || (this._events[name] = []);
      list.push({callback: callback, context: context, ctx: context || this});
      return this;
    },

    // Bind events to only be triggered a single time. After the first time
    // the callback is invoked, it will be removed.
    once: function(name, callback, context) {
      if (!(eventsApi(this, 'once', name, [callback, context]) && callback)) return this;
      var self = this;
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      this.on(name, once, context);
      return this;
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `events` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var list, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = {};
        return this;
      }

      names = name ? [name] : _.keys(this._events);
      for (i = 0, l = names.length; i < l; i++) {
        name = names[i];
        if (list = this._events[name]) {
          events = [];
          if (callback || context) {
            for (j = 0, k = list.length; j < k; j++) {
              ev = list[j];
              if ((callback && callback !== (ev.callback._callback || ev.callback)) ||
                  (context && context !== ev.context)) {
                events.push(ev);
              }
            }
          }
          this._events[name] = events;
        }
      }

      return this;
    },

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    trigger: function(name) {
      if (!this._events) return this;
      var args = slice.call(arguments, 1);
      if (!eventsApi(this, 'trigger', name, args)) return this;
      var events = this._events[name];
      var allEvents = this._events.all;
      if (events) triggerEvents(this, events, args);
      if (allEvents) triggerEvents(this, allEvents, arguments);
      return this;
    },

    // An inversion-of-control version of `on`. Tell *this* object to listen to
    // an event in another object ... keeping track of what it's listening to.
    listenTo: function(object, events, callback) {
      var listeners = this._listeners || (this._listeners = {});
      var id = object._listenerId || (object._listenerId = _.uniqueId('l'));
      listeners[id] = object;
      object.on(events, callback || this, this);
      return this;
    },

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    stopListening: function(object, events, callback) {
      var listeners = this._listeners;
      if (!listeners) return;
      if (object) {
        object.off(events, callback, this);
        if (!events && !callback) delete listeners[object._listenerId];
      } else {
        for (var id in listeners) {
          listeners[id].off(null, null, this);
        }
        this._listeners = {};
      }
      return this;
    }
  };

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Create a new model, with defined attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var defaults;
    var attrs = attributes || {};
    this.cid = _.uniqueId('c');
    this.changed = {};
    this.attributes = {};
    this._changes = [];
    if (options && options.collection) this.collection = options.collection;
    if (options && options.parse) attrs = this.parse(attrs);
    if (defaults = _.result(this, 'defaults')) _.defaults(attrs, defaults);
    this.set(attrs, {silent: true});
    this._currentAttributes = _.clone(this.attributes);
    this._previousAttributes = _.clone(this.attributes);
    this.initialize.apply(this, arguments);
  };

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Set a hash of model attributes on the object, firing `"change"` unless
    // you choose to silence it.
    set: function(key, val, options) {
      var attr, attrs;
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (_.isObject(key)) {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      // Extract attributes and options.
      var silent = options && options.silent;
      var unset = options && options.unset;

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Check for changes of `id`.
      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      var now = this.attributes;

      // For each `set` attribute...
      for (attr in attrs) {
        val = attrs[attr];

        // Update or delete the current value, and track the change.
        unset ? delete now[attr] : now[attr] = val;
        this._changes.push(attr, val);
      }

      // Signal that the model's state has potentially changed, and we need
      // to recompute the actual changes.
      this._hasComputed = false;

      // Fire the `"change"` events.
      if (!silent) this.change(options);
      return this;
    },

    // Remove an attribute from the model, firing `"change"` unless you choose
    // to silence it. `unset` is a noop if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"` unless you choose
    // to silence it.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Fetch the model from the server. If the server's representation of the
    // model differs from its current attributes, they will be overriden,
    // triggering a `"change"` event.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp, status, xhr) {
        if (!model.set(model.parse(resp), options)) return false;
        if (success) success(model, resp, options);
      };
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      var attrs, current, done;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || _.isObject(key)) {
        attrs = key;
        options = val;
      } else if (key != null) {
        (attrs = {})[key] = val;
      }
      options = options ? _.clone(options) : {};

      // If we're "wait"-ing to set changed attributes, validate early.
      if (options.wait) {
        if (attrs && !this._validate(attrs, options)) return false;
        current = _.clone(this.attributes);
      }

      // Regular saves `set` attributes before persisting to the server.
      var silentOptions = _.extend({}, options, {silent: true});
      if (attrs && !this.set(attrs, options.wait ? silentOptions : options)) {
        return false;
      }

      // Do not persist invalid models.
      if (!attrs && !this._validate(null, options)) return false;

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      var model = this;
      var success = options.success;
      options.success = function(resp, status, xhr) {
        done = true;
        var serverAttrs = model.parse(resp);
        if (options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (!model.set(serverAttrs, options)) return false;
        if (success) success(model, resp, options);
      };

      // Finish configuring and sending the Ajax request.
      var method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method == 'patch') options.attrs = attrs;
      var xhr = this.sync(method, this, options);

      // When using `wait`, reset attributes to original values unless
      // `success` has been called already.
      if (!done && options.wait) {
        this.clear(silentOptions);
        this.set(current, silentOptions);
      }

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;

      var destroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (options.wait || model.isNew()) destroy();
        if (success) success(model, resp, options);
      };

      if (this.isNew()) {
        options.success();
        return false;
      }

      var xhr = this.sync('delete', this, options);
      if (!options.wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base = _.result(this, 'urlRoot') || _.result(this.collection, 'url') || urlError();
      if (this.isNew()) return base;
      return base + (base.charAt(base.length - 1) === '/' ? '' : '/') + encodeURIComponent(this.id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return this.id == null;
    },

    // Call this method to manually fire a `"change"` event for this model and
    // a `"change:attribute"` event for each changed attribute.
    // Calling this will cause all objects observing the model to update.
    change: function(options) {
      var changing = this._changing;
      this._changing = true;

      // Generate the changes to be triggered on the model.
      var triggers = this._computeChanges(true);

      this._pending = !!triggers.length;

      for (var i = triggers.length - 2; i >= 0; i -= 2) {
        this.trigger('change:' + triggers[i], this, triggers[i + 1], options);
      }

      if (changing) return this;

      // Trigger a `change` while there have been changes.
      while (this._pending) {
        this._pending = false;
        this.trigger('change', this, options);
        this._previousAttributes = _.clone(this.attributes);
      }

      this._changing = false;
      return this;
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (!this._hasComputed) this._computeChanges();
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false, old = this._previousAttributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    // Looking at the built up list of `set` attribute changes, compute how
    // many of the attributes have actually changed. If `loud`, return a
    // boiled-down list of only the real changes.
    _computeChanges: function(loud) {
      this.changed = {};
      var already = {};
      var triggers = [];
      var current = this._currentAttributes;
      var changes = this._changes;

      // Loop through the current queue of potential model changes.
      for (var i = changes.length - 2; i >= 0; i -= 2) {
        var key = changes[i], val = changes[i + 1];
        if (already[key]) continue;
        already[key] = true;

        // Check if the attribute has been modified since the last change,
        // and update `this.changed` accordingly. If we're inside of a `change`
        // call, also add a trigger to the list.
        if (current[key] !== val) {
          this.changed[key] = val;
          if (!loud) continue;
          triggers.push(key, val);
          current[key] = val;
        }
      }
      if (loud) this._changes = [];

      // Signals `this.changed` is current to prevent duplicate calls from `this.hasChanged`.
      this._hasComputed = true;
      return triggers;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. If a specific `error` callback has
    // been passed, call that instead of firing the general `"error"` event.
    _validate: function(attrs, options) {
      if (!this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validate(attrs, options);
      if (!error) return true;
      if (options && options.error) options.error(this, error, options);
      this.trigger('error', this, error, options);
      return false;
    }

  });

  // Backbone.Collection
  // -------------------

  // Provides a standard collection class for our sets of models, ordered
  // or unordered. If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set. Pass **silent** to avoid
    // firing the `add` event for every new model.
    add: function(models, options) {
      var i, args, length, model, existing, needsSort;
      var at = options && options.at;
      var sort = ((options && options.sort) == null ? true : options.sort);
      models = _.isArray(models) ? models.slice() : [models];

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      for (i = models.length - 1; i >= 0; i--) {
        if(!(model = this._prepareModel(models[i], options))) {
          this.trigger("error", this, models[i], options);
          models.splice(i, 1);
          continue;
        }
        models[i] = model;

        existing = model.id != null && this._byId[model.id];
        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        if (existing || this._byCid[model.cid]) {
          if (options && options.merge && existing) {
            existing.set(model.attributes, options);
            needsSort = sort;
          }
          models.splice(i, 1);
          continue;
        }

        // Listen to added models' events, and index models for lookup by
        // `id` and by `cid`.
        model.on('all', this._onModelEvent, this);
        this._byCid[model.cid] = model;
        if (model.id != null) this._byId[model.id] = model;
      }

      // See if sorting is needed, update `length` and splice in new models.
      if (models.length) needsSort = sort;
      this.length += models.length;
      args = [at != null ? at : this.models.length, 0];
      push.apply(args, models);
      splice.apply(this.models, args);

      // Sort the collection if appropriate.
      if (needsSort && this.comparator && at == null) this.sort({silent: true});

      if (options && options.silent) return this;

      // Trigger `add` events.
      while (model = models.shift()) {
        model.trigger('add', model, this, options);
      }

      return this;
    },

    // Remove a model, or a list of models from the set. Pass silent to avoid
    // firing the `remove` event for every model removed.
    remove: function(models, options) {
      var i, l, index, model;
      options || (options = {});
      models = _.isArray(models) ? models.slice() : [models];
      for (i = 0, l = models.length; i < l; i++) {
        model = this.get(models[i]);
        if (!model) continue;
        delete this._byId[model.id];
        delete this._byCid[model.cid];
        index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        this._removeReference(model);
      }
      return this;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: this.length}, options));
      return model;
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: 0}, options));
      return model;
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function(begin, end) {
      return this.models.slice(begin, end);
    },

    // Get a model from the set by id.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj.id != null ? obj.id : obj] || this._byCid[obj.cid || obj];
    },

    // Get the model at the given index.
    at: function(index) {
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of `filter`.
    where: function(attrs) {
      if (_.isEmpty(attrs)) return [];
      return this.filter(function(model) {
        for (var key in attrs) {
          if (attrs[key] !== model.get(key)) return false;
        }
        return true;
      });
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      if (!this.comparator) {
        throw new Error('Cannot sort a set without a comparator');
      }

      if (_.isString(this.comparator) || this.comparator.length === 1) {
        this.models = this.sortBy(this.comparator, this);
      } else {
        this.models.sort(_.bind(this.comparator, this));
      }

      if (!options || !options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return _.invoke(this.models, 'get', attr);
    },

    // Smartly update a collection with a change set of models, adding,
    // removing, and merging as necessary.
    update: function(models, options) {
      var model, i, l, existing;
      var add = [], remove = [], modelMap = {};
      var idAttr = this.model.prototype.idAttribute;
      options = _.extend({add: true, merge: true, remove: true}, options);
      if (options.parse) models = this.parse(models);

      // Allow a single model (or no argument) to be passed.
      if (!_.isArray(models)) models = models ? [models] : [];

      // Proxy to `add` for this case, no need to iterate...
      if (options.add && !options.remove) return this.add(models, options);

      // Determine which models to add and merge, and which to remove.
      for (i = 0, l = models.length; i < l; i++) {
        model = models[i];
        existing = this.get(model.id || model.cid || model[idAttr]);
        if (options.remove && existing) modelMap[existing.cid] = true;
        if ((options.add && !existing) || (options.merge && existing)) {
          add.push(model);
        }
      }
      if (options.remove) {
        for (i = 0, l = this.models.length; i < l; i++) {
          model = this.models[i];
          if (!modelMap[model.cid]) remove.push(model);
        }
      }

      // Remove models (if applicable) before we add and merge the rest.
      if (remove.length) this.remove(remove, options);
      if (add.length) this.add(add, options);
      return this;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any `add` or `remove` events. Fires `reset` when finished.
    reset: function(models, options) {
      options || (options = {});
      if (options.parse) models = this.parse(models);
      for (var i = 0, l = this.models.length; i < l; i++) {
        this._removeReference(this.models[i]);
      }
      options.previousModels = this.models;
      this._reset();
      if (models) this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return this;
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `add: true` is passed, appends the
    // models to the collection instead of resetting.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var collection = this;
      var success = options.success;
      options.success = function(resp, status, xhr) {
        var method = options.update ? 'update' : 'reset';
        collection[method](resp, options);
        if (success) success(collection, resp, options);
      };
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      var collection = this;
      options = options ? _.clone(options) : {};
      model = this._prepareModel(model, options);
      if (!model) return false;
      if (!options.wait) collection.add(model, options);
      var success = options.success;
      options.success = function(model, resp, options) {
        if (options.wait) collection.add(model, options);
        if (success) success(model, resp, options);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models);
    },

    // Proxy to _'s chain. Can't be proxied the same way the rest of the
    // underscore methods are proxied because it relies on the underscore
    // constructor.
    chain: function() {
      return _(this.models).chain();
    },

    // Reset all internal state. Called when the collection is reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
      this._byCid = {};
    },

    // Prepare a model or hash of attributes to be added to this collection.
    _prepareModel: function(attrs, options) {
      if (attrs instanceof Model) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options || (options = {});
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model._validate(attrs, options)) return false;
      return model;
    },

    // Internal method to remove a model's ties to a collection.
    _removeReference: function(model) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (model && event === 'change:' + model.idAttribute) {
        delete this._byId[model.previous(model.idAttribute)];
        if (model.id != null) this._byId[model.id] = model;
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  var methods = ['forEach', 'each', 'map', 'collect', 'reduce', 'foldl',
    'inject', 'reduceRight', 'foldr', 'find', 'detect', 'filter', 'select',
    'reject', 'every', 'all', 'some', 'any', 'include', 'contains', 'invoke',
    'max', 'min', 'sortedIndex', 'toArray', 'size', 'first', 'head', 'take',
    'initial', 'rest', 'tail', 'last', 'without', 'indexOf', 'shuffle',
    'lastIndexOf', 'isEmpty'];

  // Mix in each Underscore method as a proxy to `Collection#models`.
  _.each(methods, function(method) {
    Collection.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.models);
      return _[method].apply(_, args);
    };
  });

  // Underscore methods that take a property name as an argument.
  var attributeMethods = ['groupBy', 'countBy', 'sortBy'];

  // Use attributes instead of properties.
  _.each(attributeMethods, function(method) {
    Collection.prototype[method] = function(value, context) {
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _[method](this.models, iterator, context);
    };
  });

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (!callback) callback = this[name];
      Backbone.history.route(route, _.bind(function(fragment) {
        var args = this._extractParameters(route, fragment);
        callback && callback.apply(this, args);
        this.trigger.apply(this, ['route:' + name].concat(args));
        Backbone.history.trigger('route', this, name, args);
      }, this));
      return this;
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, '([^\/]+)')
                   .replace(splatParam, '(.*?)');
      return new RegExp('^' + route + '$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted parameters.
    _extractParameters: function(route, fragment) {
      return route.exec(fragment).slice(1);
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on URL fragments. If the
  // browser does not support `onhashchange`, falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');

    // #1653 - Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for detecting MSIE.
  var isExplorer = /msie [\w.]+/;

  // Cached regex for removing a trailing slash.
  var trailingSlash = /\/$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the cross-browser normalized URL fragment, either from the URL,
    // the hash, or the override.
    getFragment: function(fragment, forcePushState) {
      if (fragment == null) {
        if (this._hasPushState || !this._wantsHashChange || forcePushState) {
          fragment = this.location.pathname;
          var root = this.root.replace(trailingSlash, '');
          if (!fragment.indexOf(root)) fragment = fragment.substr(root.length);
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error("Backbone.history has already been started");
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({}, {root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
      var fragment          = this.getFragment();
      var docMode           = document.documentMode;
      var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      if (oldIE && this._wantsHashChange) {
        this.iframe = Backbone.$('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
        this.navigate(fragment);
      }

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._hasPushState) {
        Backbone.$(window).bind('popstate', this.checkUrl);
      } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
        Backbone.$(window).bind('hashchange', this.checkUrl);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      // Determine if we need to change the base url, for a pushState link
      // opened by a non-pushState browser.
      this.fragment = fragment;
      var loc = this.location;
      var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === this.root;

      // If we've started off with a route from a `pushState`-enabled browser,
      // but we're currently in a browser that doesn't support it...
      if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
        this.fragment = this.getFragment(null, true);
        this.location.replace(this.root + this.location.search + '#' + this.fragment);
        // Return immediately as browser will do redirect to new url
        return true;

      // Or if we've started out with a hash-based route, but we're currently
      // in a browser where it could be `pushState`-based instead...
      } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
        this.fragment = this.getHash().replace(routeStripper, '');
        this.history.replaceState({}, document.title, this.root + this.fragment + loc.search);
      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      Backbone.$(window).unbind('popstate', this.checkUrl).unbind('hashchange', this.checkUrl);
      clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();
      if (current === this.fragment && this.iframe) {
        current = this.getFragment(this.getHash(this.iframe));
      }
      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl() || this.loadUrl(this.getHash());
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragmentOverride) {
      var fragment = this.fragment = this.getFragment(fragmentOverride);
      var matched = _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
      return matched;
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: options};
      fragment = this.getFragment(fragment || '');
      if (this.fragment === fragment) return;
      this.fragment = fragment;
      var url = this.root + fragment;

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._hasPushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if(!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // #1649 - Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Backbone.View
  // -------------

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    this._configure(options || {});
    this._ensureElement();
    this.initialize.apply(this, arguments);
    this.delegateEvents();
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be merged as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be prefered to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this.$el.remove();
      this.stopListening();
      return this;
    },

    // For small amounts of DOM Elements, where a full-blown template isn't
    // needed, use **make** to manufacture elements, one at a time.
    //
    //     var el = this.make('li', {'class': 'row'}, this.model.escape('title'));
    //
    make: function(tagName, attributes, content) {
      var el = document.createElement(tagName);
      if (attributes) Backbone.$(el).attr(attributes);
      if (content != null) Backbone.$(el).html(content);
      return el;
    },

    // Change the view's element (`this.el` property), including event
    // re-delegation.
    setElement: function(element, delegate) {
      if (this.$el) this.undelegateEvents();
      this.$el = element instanceof Backbone.$ ? element : Backbone.$(element);
      this.el = this.$el[0];
      if (delegate !== false) this.delegateEvents();
      return this;
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save'
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    // This only works for delegate-able events: not `focus`, `blur`, and
    // not `change`, `submit`, and `reset` in Internet Explorer.
    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) throw new Error('Method "' + events[key] + '" does not exist');
        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        method = _.bind(method, this);
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
          this.$el.bind(eventName, method);
        } else {
          this.$el.delegate(selector, eventName, method);
        }
      }
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      this.$el.unbind('.delegateEvents' + this.cid);
    },

    // Performs the initial configuration of a View with a set of options.
    // Keys with special meaning *(model, collection, id, className)*, are
    // attached directly to the view.
    _configure: function(options) {
      if (this.options) options = _.extend({}, _.result(this, 'options'), options);
      _.extend(this, _.pick(options, viewOptions));
      this.options = options;
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        this.setElement(this.make(_.result(this, 'tagName'), attrs), false);
      } else {
        this.setElement(_.result(this, 'el'), false);
      }
    }

  });

  // Backbone.sync
  // -------------

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch':  'PATCH',
    'delete': 'DELETE',
    'read':   'GET'
  };

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    var success = options.success;
    options.success = function(resp, status, xhr) {
      if (success) success(resp, status, xhr);
      model.trigger('sync', model, resp, options);
    };

    var error = options.error;
    options.error = function(xhr, status, thrown) {
      if (error) error(model, xhr, options);
      model.trigger('error', model, xhr, options);
    };

    // Make the request, allowing the user to override any Ajax options.
    var xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

}).call(this);

});

require.define("/node_modules/backbone/node_modules/underscore/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/backbone/node_modules/underscore/underscore.js",function(require,module,exports,__dirname,__filename,process,global){//     Underscore.js 1.4.3
//     http://underscorejs.org
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var push             = ArrayProto.push,
      slice            = ArrayProto.slice,
      concat           = ArrayProto.concat,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.4.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // with specific `key:value` pairs.
  _.where = function(obj, attrs) {
    if (_.isEmpty(attrs)) return [];
    return _.filter(obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See: https://bugs.webkit.org/show_bug.cgi?id=80797
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value || _.identity);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    each(input, function(value) {
      if (_.isArray(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(concat.apply(ArrayProto, arguments));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(args, "" + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function(func, context) {
    var args, bound;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, result;
    var previous = 0;
    var later = function() {
      previous = new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] == null) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent, but `Object`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                               _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
        return false;
      }
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(n);
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + (0 | Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = '' + ++idCounter;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      var render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

});

require.define("/src/js/util/constants.js",function(require,module,exports,__dirname,__filename,process,global){/**
 * Constants....!!!
 */
var TIME = {
  betweenCommandsDelay: 400
};

// useful for locks, etc
var GLOBAL = {
  isAnimating: false
};

var VIEWPORT = {
  minZoom: 0.55,
  maxZoom: 1.25,
  minWidth: 600,
  minHeight: 600
};

var GRAPHICS = {
  arrowHeadSize: 8,

  nodeRadius: 17,
  curveControlPointOffset: 50,
  defaultEasing: 'easeInOut',
  defaultAnimationTime: 400,

  //rectFill: '#FF3A3A',
  rectFill: 'hsb(0.8816909813322127,0.7,1)',
  headRectFill: '#2831FF',
  rectStroke: '#FFF',
  rectStrokeWidth: '3',

  multiBranchY: 20,
  upstreamHeadOpacity: 0.5,
  upstreamNoneOpacity: 0.2,
  edgeUpstreamHeadOpacity: 0.4,
  edgeUpstreamNoneOpacity: 0.15,

  visBranchStrokeWidth: 2,
  visBranchStrokeColorNone: '#333',

  defaultNodeFill: 'hsba(0.5,0.8,0.7,1)',
  defaultNodeStrokeWidth: 2,
  defaultNodeStroke: '#FFF',

  orphanNodeFill: 'hsb(0.5,0.8,0.7)'
};

exports.GLOBAL = GLOBAL;
exports.TIME = TIME;
exports.GRAPHICS = GRAPHICS;
exports.VIEWPORT = VIEWPORT;


});

require.define("/src/js/util/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

exports.isBrowser = function() {
  var inBrowser = String(typeof window) !== 'undefined';
  return inBrowser;
};

exports.splitTextCommand = function(value, func, context) {
  func = _.bind(func, context);
  _.each(value.split(';'), function(command, index) {
    command = _.escape(command);
    command = command
      .replace(/^(\s+)/, '')
      .replace(/(\s+)$/, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");

    if (index > 0 && !command.length) {
      return;
    }
    func(command);
  });
};

exports.genParseCommand = function(regexMap, eventName) {
  return function(str) {
    var method;
    var regexResults;

    _.each(regexMap, function(regex, _method) {
      var results = regex.exec(str);
      if (results) {
        method = _method;
        regexResults = results;
      }
    });

    return (!method) ? false : {
      toSet: {
        eventName: eventName,
        method: method,
        regexResults: regexResults
      }
    };
  };
};

});

require.define("/src/js/level/sandbox.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var Main = require('../app');

var Visualization = require('../visuals/visualization').Visualization;
var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;
var DisabledMap = require('../level/disabledMap').DisabledMap;
var Command = require('../models/commandModel').Command;
var GitShim = require('../git/gitShim').GitShim;

var Views = require('../views');
var ModalTerminal = Views.ModalTerminal;
var ModalAlert = Views.ModalAlert;
var BuilderViews = require('../views/builderViews');
var MultiView = require('../views/multiView').MultiView;

var Sandbox = Backbone.View.extend({
  // tag name here is purely vestigial. I made this a view
  // simply to use inheritance and have a nice event system in place
  tagName: 'div',
  initialize: function(options) {
    options = options || {};
    this.options = options;

    this.initVisualization(options);
    this.initCommandCollection(options);
    this.initParseWaterfall(options);
    this.initGitShim(options);

    if (!options.wait) {
      this.takeControl();
    }
  },

  getDefaultVisEl: function() {
    return $('#mainVisSpace')[0];
  },

  getAnimationTime: function() { return 700 * 1.5; },

  initVisualization: function(options) {
    this.mainVis = new Visualization({
      el: options.el || this.getDefaultVisEl()
    });
  },

  initCommandCollection: function(options) {
    // don't add it to just any collection -- adding to the
    // CommandUI collection will put in history
    this.commandCollection = Main.getCommandUI().commandCollection;
  },

  initParseWaterfall: function(options) {
    this.parseWaterfall = new ParseWaterfall();
  },

  initGitShim: function(options) {
  },

  takeControl: function() {
    // we will be handling commands that are submitted, mainly to add the sanadbox
    // functionality (which is included by default in ParseWaterfall())
    Main.getEventBaton().stealBaton('commandSubmitted', this.commandSubmitted, this);
    // we obviously take care of sandbox commands
    Main.getEventBaton().stealBaton('processSandboxCommand', this.processSandboxCommand, this);

    // a few things to help transition between levels and sandbox
    Main.getEventBaton().stealBaton('levelExited', this.levelExited, this);

    this.insertGitShim();
  },

  releaseControl: function() {
    // we will be handling commands that are submitted, mainly to add the sanadbox
    // functionality (which is included by default in ParseWaterfall())
    Main.getEventBaton().releaseBaton('commandSubmitted', this.commandSubmitted, this);
    // we obviously take care of sandbox commands
    Main.getEventBaton().releaseBaton('processSandboxCommand', this.processSandboxCommand, this);
    // a few things to help transition between levels and sandbox
    Main.getEventBaton().releaseBaton('levelExited', this.levelExited, this);

    this.releaseGitShim();
  },

  releaseGitShim: function() {
    if (this.gitShim) {
      this.gitShim.removeShim();
    }
  },

  insertGitShim: function() {
    // and our git shim goes in after the git engine is ready so it doesn't steal the baton
    // too early
    if (this.gitShim) {
      this.mainVis.customEvents.on('gitEngineReady', function() {
          this.gitShim.insertShim();
      },this);
    }
  },

  commandSubmitted: function(value) {
    // allow other things to see this command (aka command history on terminal)
    Main.getEvents().trigger('commandSubmittedPassive', value);

    util.splitTextCommand(value, function(command) {
      this.commandCollection.add(new Command({
        rawStr: command,
        parseWaterfall: this.parseWaterfall
      }));
    }, this);
  },

  startLevel: function(command, deferred) {
    var regexResults = command.get('regexResults') || [];
    var desiredID = regexResults[1] || '';
    var levelJSON = Main.getLevelArbiter().getLevel(desiredID);

    // handle the case where that level is not found...
    if (!levelJSON) {
      command.addWarning(
        'A level for that id "' + desiredID + '" was not found!! Opening up level selection view...'
      );
      Main.getEventBaton().trigger('commandSubmitted', 'levels');

      command.set('status', 'error');
      deferred.resolve();
      return;
    }

    // we are good to go!! lets prep a bit visually
    this.hide();
    this.clear();

    // we don't even need a reference to this,
    // everything will be handled via event baton :DDDDDDDDD
    var whenLevelOpen = Q.defer();
    var Level = require('../level').Level;

    this.currentLevel = new Level({
      level: levelJSON,
      deferred: whenLevelOpen,
      command: command
    });

    whenLevelOpen.promise.then(function() {
      command.finishWith(deferred);
    });
  },

  buildLevel: function(command, deferred) {
    this.hide();
    this.clear();

    var whenBuilderOpen = Q.defer();

    var LevelBuilder = require('../level/builder').LevelBuilder;
    this.levelBuilder = new LevelBuilder({
      deferred: whenBuilderOpen
    });

    whenBuilderOpen.promise.then(function() {
      command.finishWith(deferred);
    });
  },

  exitLevel: function(command, deferred) {
    command.addWarning(
      "You aren't in a level! You are in a sandbox, start a level with `level [id]`"
    );
    command.set('status', 'error');
    deferred.resolve();
  },

  showLevels: function(command, deferred) {
    var whenClosed = Q.defer();
    Main.getLevelDropdown().show(whenClosed, command);
    whenClosed.promise.done(function() {
      command.finishWith(deferred);
    });
  },

  resetSolved: function(command, deferred) {
    Main.getLevelArbiter().resetSolvedMap();
    command.addWarning(
      "Solved map was reset, you are starting from a clean slate!"
    );
    command.finishWith(deferred);
  },

  processSandboxCommand: function(command, deferred) {
    // I'm tempted to do camcel case conversion, but there are
    // some exceptions to the rule
    var commandMap = {
      'reset solved': this.resetSolved,
      'help general': this.helpDialog,
      'help': this.helpDialog,
      'reset': this.reset,
      'delay': this.delay,
      'clear': this.clear,
      'exit level': this.exitLevel,
      'level': this.startLevel,
      'sandbox': this.exitLevel,
      'levels': this.showLevels,
      'mobileAlert': this.mobileAlert,
      'build level': this.buildLevel,
      'export tree': this.exportTree,
      'import tree': this.importTree,
      'import level': this.importLevel
    };

    var method = commandMap[command.get('method')];
    if (!method) { throw new Error('no method for that wut'); }

    method.apply(this, [command, deferred]);
  },

  hide: function() {
    this.mainVis.hide();
  },

  levelExited: function() {
    this.show();
  },

  show: function() {
    this.mainVis.show();
  },

  importTree: function(command, deferred) {
    var jsonGrabber = new BuilderViews.MarkdownPresenter({
      previewText: "Paste a tree JSON blob below!",
      fillerText: ' '
    });
    jsonGrabber.deferred.promise
    .then(_.bind(function(treeJSON) {
      try {
        this.mainVis.gitEngine.loadTree(JSON.parse(treeJSON));
      } catch(e) {
        this.mainVis.reset();
        new MultiView({
          childViews: [{
            type: 'ModalAlert',
            options: {
              markdowns: [
                '## Error!',
                '',
                'Something is wrong with that JSON! Here is the error:',
                '',
                String(e)
              ]
            }
          }]
        });
      }
    }, this))
    .fail(function() { })
    .done(function() {
      command.finishWith(deferred);
    });
  },

  importLevel: function(command, deferred) {
    var jsonGrabber = new BuilderViews.MarkdownPresenter({
      previewText: 'Paste a level JSON blob in here!',
      fillerText: ' '
    });

    jsonGrabber.deferred.promise
    .then(_.bind(function(inputText) {
      var Level = require('../level').Level;
      try {
        var levelJSON = JSON.parse(inputText);
        var whenLevelOpen = Q.defer();
        this.currentLevel = new Level({
          level: levelJSON,
          deferred: whenLevelOpen,
          command: command
        });

        whenLevelOpen.promise.then(function() {
          command.finishWith(deferred);
        });
      } catch(e) {
        new MultiView({
          childViews: [{
            type: 'ModalAlert',
            options: {
              markdowns: [
                '## Error!',
                '',
                'Something is wrong with that level JSON, this happened:',
                '',
                String(e)
              ]
            }
          }]
        });
        command.finishWith(deferred);
      }
    }, this))
    .fail(function() {
      command.finishWith(deferred);
    })
    .done();
  },

  exportTree: function(command, deferred) {
    var treeJSON = JSON.stringify(this.mainVis.gitEngine.exportTree(), null, 2);

    var showJSON = new MultiView({
      childViews: [{
        type: 'MarkdownPresenter',
        options: {
          previewText: 'Share this tree with friends! They can load it with "import tree"',
          fillerText: treeJSON,
          noConfirmCancel: true
        }
      }]
    });
    showJSON.getPromise()
    .then(function() {
      command.finishWith(deferred);
    })
    .done();
  },

  clear: function(command, deferred) {
    Main.getEvents().trigger('clearOldCommands');
    if (command && deferred) {
      command.finishWith(deferred);
    }
  },

  mobileAlert: function(command, deferred) {
    alert("Can't bring up the keyboard on mobile / tablet :( try visiting on desktop! :D");
    command.finishWith(deferred);
  },

  delay: function(command, deferred) {
    var amount = parseInt(command.get('regexResults')[1], 10);
    setTimeout(function() {
      command.finishWith(deferred);
    }, amount);
  },

  reset: function(command, deferred) {
    this.mainVis.reset();

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.mainVis.getAnimationTime());
  },

  helpDialog: function(command, deferred) {
    var helpDialog = new MultiView({
      childViews: require('../dialogs/sandbox').dialog
    });
    helpDialog.getPromise().then(_.bind(function() {
      // the view has been closed, lets go ahead and resolve our command
      command.finishWith(deferred);
    }, this))
    .done();
  }
});

exports.Sandbox = Sandbox;


});

require.define("/node_modules/q/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"q.js"}
});

require.define("/node_modules/q/q.js",function(require,module,exports,__dirname,__filename,process,global){// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    // Turn off strict mode for this function so we can assign to global.Q
    /*jshint strict: false*/

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object") {
        definition(void 0, exports);

    // RequireJS
    } else if (typeof define === "function") {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = function () {
                var Q = {};
                return definition(void 0, Q);
            };
        }

    // <script>
    } else {
        definition(void 0, Q = {});
    }

})(function (require, exports) {
"use strict";

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback "defend" and in "allResolved"
var noop = function () {};

// for the security conscious, defend may be a deep freeze as provided
// by cajaVM.  Otherwise we try to provide a shallow freeze just to
// discourage promise changes that are not compatible with secure
// usage.  If Object.freeze does not exist, fall back to doing nothing
// (no op).
var defend = Object.freeze || noop;
if (typeof cajaVM !== "undefined") {
    defend = cajaVM.def;
}

// use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick;
if (typeof process !== "undefined") {
    // node
    nextTick = process.nextTick;
} else if (typeof setImmediate === "function") {
    // In IE10, or use https://github.com/NobleJS/setImmediate
    nextTick = setImmediate;
} else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    // linked list of tasks (single, with head node)
    var head = {}, tail = head;
    channel.port1.onmessage = function () {
        head = head.next;
        var task = head.task;
        delete head.task;
        task();
    };
    nextTick = function (task) {
        tail = tail.next = {task: task};
        channel.port2.postMessage(0);
    };
} else {
    // old browsers
    nextTick = function (task) {
        setTimeout(task, 0);
    };
}

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this does have the nice side-effect of reducing the size
// of the code by reducing x.call() to merely x(), eliminating many
// hard-to-minify characters.
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var uncurryThis;
// I have kept both variations because the first is theoretically
// faster, if bind is available.
if (Function.prototype.bind) {
    var Function_bind = Function.prototype.bind;
    uncurryThis = Function_bind.bind(Function_bind.call);
} else {
    uncurryThis = function (f) {
        return function () {
            return f.call.apply(f, arguments);
        };
    };
}

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        keys.push(key);
    }
    return keys;
};

var object_toString = Object.prototype.toString;

// generator related shims

function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible (that is, if in V8), transform the error stack
    // trace by removing Node and Q cruft, then concatenating with
    // the stack trace of the promise we are ``done``ing. See #57.
    if (promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        error.stack = filterStackString(error.stack) +
            "\n" + STACK_JUMP_SEPARATOR + "\n" +
            filterStackString(promise.stack);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line)) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function isInternalFrame(stackLine) {
    var pieces = /at .+ \((.*):(\d+):\d+\)/.exec(stackLine);

    if (!pieces) {
        return false;
    }

    var fileName = pieces[1];
    var lineNumber = pieces[2];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (Error.captureStackTrace) {
        var fileName, lineNumber;

        var oldPrepareStackTrace = Error.prepareStackTrace;

        Error.prepareStackTrace = function (error, frames) {
            fileName = frames[1].getFileName();
            lineNumber = frames[1].getLineNumber();
        };

        // teases call of temporary prepareStackTrace
        // JSHint and Closure Compiler generate known warnings here
        /*jshint expr: true */
        new Error().stack;

        Error.prepareStackTrace = oldPrepareStackTrace;
        qFileName = fileName;
        return lineNumber;
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative + " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
exports.nextTick = nextTick;

/**
 * Constructs a {promise, resolve} object.
 *
 * The resolver is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke the resolver with any value that is
 * not a function. To reject the promise, invoke the resolver with a rejection
 * object. To put the promise in the same state as another promise, invoke the
 * resolver with that other promise.
 */
exports.defer = defer;
function defer() {
    // if "pending" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the pending array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the ref promise because it handles both fully
    // resolved values and other promises gracefully.
    var pending = [], progressListeners = [], value;

    var deferred = object_create(defer.prototype);
    var promise = object_create(makePromise.prototype);

    promise.promiseSend = function (op, _, __, progress) {
        var args = array_slice(arguments);
        if (pending) {
            pending.push(args);
            if (op === "when" && progress) {
                progressListeners.push(progress);
            }
        } else {
            nextTick(function () {
                value.promiseSend.apply(value, args);
            });
        }
    };

    promise.valueOf = function () {
        if (pending) {
            return promise;
        }
        return value.valueOf();
    };

    if (Error.captureStackTrace) {
        Error.captureStackTrace(promise, defer);

        // Reify the stack into a string by using the accessor; this prevents
        // memory leaks as per GH-111. At the same time, cut off the first line;
        // it's always just "[object Promise]\n", as per the `toString`.
        promise.stack = promise.stack.substring(promise.stack.indexOf("\n") + 1);
    }

    function become(resolvedValue) {
        if (!pending) {
            return;
        }
        value = resolve(resolvedValue);
        array_reduce(pending, function (undefined, pending) {
            nextTick(function () {
                value.promiseSend.apply(value, pending);
            });
        }, void 0);
        pending = void 0;
        progressListeners = void 0;
    }

    defend(promise);

    deferred.promise = promise;
    deferred.resolve = become;
    deferred.reject = function (exception) {
        become(reject(exception));
    };
    deferred.notify = function (progress) {
        if (pending) {
            array_reduce(progressListeners, function (undefined, progressListener) {
                nextTick(function () {
                    progressListener(progress);
                });
            }, void 0);
        }
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};
// XXX deprecated
defer.prototype.node = deprecate(defer.prototype.makeNodeResolver, "node", "makeNodeResolver");

/**
 * @param makePromise {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in makePromise
 */
exports.promise = promise;
function promise(makePromise) {
    var deferred = defer();
    fcall(
        makePromise,
        deferred.resolve,
        deferred.reject,
        deferred.notify
    ).fail(deferred.reject);
    return deferred.promise;
}

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * put(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
exports.makePromise = makePromise;
function makePromise(descriptor, fallback, valueOf, exception) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error("Promise does not support operation: " + op));
        };
    }

    var promise = object_create(makePromise.prototype);

    promise.promiseSend = function (op, resolved /* ...args */) {
        var args = array_slice(arguments, 2);
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.apply(promise, [op].concat(args));
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolved) {
            resolved(result);
        }
    };

    if (valueOf) {
        promise.valueOf = valueOf;
    }

    if (exception) {
        promise.exception = exception;
    }

    defend(promise);

    return promise;
}

// provide thenables, CommonJS/Promises/A
makePromise.prototype.then = function (fulfilled, rejected, progressed) {
    return when(this, fulfilled, rejected, progressed);
};

makePromise.prototype.thenResolve = function (value) {
    return when(this, function () { return value; });
};

// Chainable methods
array_reduce(
    [
        "isResolved", "isFulfilled", "isRejected",
        "when", "spread", "send",
        "get", "put", "del",
        "post", "invoke",
        "keys",
        "apply", "call", "bind",
        "fapply", "fcall", "fbind",
        "all", "allResolved",
        "view", "viewInfo",
        "timeout", "delay",
        "catch", "finally", "fail", "fin", "progress", "end", "done",
        "nfcall", "nfapply", "nfbind",
        "ncall", "napply", "nbind",
        "npost", "ninvoke",
        "nend", "nodeify"
    ],
    function (undefined, name) {
        makePromise.prototype[name] = function () {
            return exports[name].apply(
                exports,
                [this].concat(array_slice(arguments))
            );
        };
    },
    void 0
);

makePromise.prototype.toSource = function () {
    return this.toString();
};

makePromise.prototype.toString = function () {
    return "[object Promise]";
};

defend(makePromise.prototype);

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */
exports.nearer = valueOf;
function valueOf(value) {
    if (isPromise(value)) {
        return value.valueOf();
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
exports.isPromise = isPromise;
function isPromise(object) {
    return object && typeof object.promiseSend === "function";
}

/**
 * @returns whether the given object is a resolved promise.
 */
exports.isResolved = isResolved;
function isResolved(object) {
    return isFulfilled(object) || isRejected(object);
}

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
exports.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(valueOf(object));
}

/**
 * @returns whether the given object is a rejected promise.
 */
exports.isRejected = isRejected;
function isRejected(object) {
    object = valueOf(object);
    return isPromise(object) && 'exception' in object;
}

var rejections = [];
var errors = [];
var errorsDisplayed;
function displayErrors() {
    if (
        !errorsDisplayed &&
        typeof window !== "undefined" &&
        !window.Touch &&
        window.console
    ) {
        // This promise library consumes exceptions thrown in handlers so
        // they can be handled by a subsequent promise.  The rejected
        // promises get added to this array when they are created, and
        // removed when they are handled.
        console.log("Should be empty:", errors);
    }
    errorsDisplayed = true;
}

/**
 * Constructs a rejected promise.
 * @param exception value describing the failure
 */
exports.reject = reject;
function reject(exception) {
    exception = exception || new Error();
    var rejection = makePromise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                var at = array_indexOf(rejections, this);
                if (at !== -1) {
                    errors.splice(at, 1);
                    rejections.splice(at, 1);
                }
            }
            return rejected ? rejected(exception) : reject(exception);
        }
    }, function fallback() {
        return reject(exception);
    }, function valueOf() {
        return this;
    }, exception);
    // note that the error has not been handled
    displayErrors();
    rejections.push(rejection);
    errors.push(exception);
    return rejection;
}

/**
 * Constructs a promise for an immediate reference.
 * @param value immediate reference
 */
exports.begin = resolve; // XXX experimental
exports.resolve = resolve;
exports.ref = deprecate(resolve, "ref", "resolve"); // XXX deprecated, use resolve
function resolve(object) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (isPromise(object)) {
        return object;
    }
    // In order to break infinite recursion or loops between `then` and
    // `resolve`, it is necessary to attempt to extract fulfilled values
    // out of foreign promise implementations before attempting to wrap
    // them as unresolved promises.  It is my hope that other
    // implementations will implement `valueOf` to synchronously extract
    // the fulfillment value from their fulfilled promises.  If the
    // other promise library does not implement `valueOf`, the
    // implementations on primordial prototypes are harmless.
    object = valueOf(object);
    // assimilate thenables, CommonJS/Promises/A
    if (object && typeof object.then === "function") {
        var deferred = defer();
        object.then(deferred.resolve, deferred.reject, deferred.notify);
        return deferred.promise;
    }
    return makePromise({
        "when": function () {
            return object;
        },
        "get": function (name) {
            return object[name];
        },
        "put": function (name, value) {
            object[name] = value;
            return object;
        },
        "del": function (name) {
            delete object[name];
            return object;
        },
        "post": function (name, value) {
            return object[name].apply(object, value);
        },
        "apply": function (self, args) {
            return object.apply(self, args);
        },
        "fapply": function (args) {
            return object.apply(void 0, args);
        },
        "viewInfo": function () {
            var on = object;
            var properties = {};

            function fixFalsyProperty(name) {
                if (!properties[name]) {
                    properties[name] = typeof on[name];
                }
            }

            while (on) {
                Object.getOwnPropertyNames(on).forEach(fixFalsyProperty);
                on = Object.getPrototypeOf(on);
            }
            return {
                "type": typeof object,
                "properties": properties
            };
        },
        "keys": function () {
            return object_keys(object);
        }
    }, void 0, function valueOf() {
        return object;
    });
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
exports.master = master;
function master(object) {
    return makePromise({
        "isDef": function () {}
    }, function fallback() {
        var args = array_slice(arguments);
        return send.apply(void 0, [object].concat(args));
    }, function () {
        return valueOf(object);
    });
}

exports.viewInfo = viewInfo;
function viewInfo(object, info) {
    object = resolve(object);
    if (info) {
        return makePromise({
            "viewInfo": function () {
                return info;
            }
        }, function fallback() {
            var args = array_slice(arguments);
            return send.apply(void 0, [object].concat(args));
        }, function () {
            return valueOf(object);
        });
    } else {
        return send(object, "viewInfo");
    }
}

exports.view = view;
function view(object) {
    return viewInfo(object).when(function (info) {
        var view;
        if (info.type === "function") {
            view = function () {
                return apply(object, void 0, arguments);
            };
        } else {
            view = {};
        }
        var properties = info.properties || {};
        object_keys(properties).forEach(function (name) {
            if (properties[name] === "function") {
                view[name] = function () {
                    return post(object, name, arguments);
                };
            }
        });
        return resolve(view);
    });
}

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
exports.when = when;
function when(value, fulfilled, rejected, progressed) {
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return fulfilled ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (rejected) {
            makeStackTraceLong(exception, resolvedValue);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return progressed ? progressed(value) : value;
    }

    var resolvedValue = resolve(value);
    nextTick(function () {
        resolvedValue.promiseSend("when", function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        });
    });

    // Progress propagator need to be attached in the current tick.
    resolvedValue.promiseSend("when", void 0, void 0, function (value) {
        deferred.notify(_progressed(value));
    });

    return deferred.promise;
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
exports.spread = spread;
function spread(promise, fulfilled, rejected) {
    return when(promise, function (valuesOrPromises) {
        return all(valuesOrPromises).then(function (values) {
            return fulfilled.apply(void 0, values);
        }, rejected);
    }, rejected);
}

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  This presently only works in
 * Firefox/Spidermonkey, however, this code does not cause syntax
 * errors in older engines.  This code should continue to work and
 * will in fact improve over time as the language improves.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 *  - in present implementations of generators, when a generator
 *    function is complete, it throws ``StopIteration``, ``return`` is
 *    a syntax error in the presence of ``yield``, so there is no
 *    observable return value. There is a proposal[1] to add support
 *    for ``return``, which would permit the value to be carried by a
 *    ``StopIteration`` instance, in which case it would fulfill the
 *    promise returned by the asynchronous generator.  This can be
 *    emulated today by throwing StopIteration explicitly with a value
 *    property.
 *
 *  [1]: http://wiki.ecmascript.org/doku.php?id=strawman:async_functions#reference_implementation
 *
 */
exports.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;
            try {
                result = generator[verb](arg);
            } catch (exception) {
                if (isStopIteration(exception)) {
                    return exception.value;
                } else {
                    return reject(exception);
                }
            }
            return when(result, callback, errback);
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "send");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 * Only useful presently in Firefox/SpiderMonkey since generators are
 * implemented.
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
exports['return'] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are resolved and passed as values (`this` is also resolved and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q.resolve(a), Q.resolve(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
exports.promised = promised;
function promised(callback) {
    return function () {
        return all([this, all(arguments)]).spread(function (self, args) {
          return callback.apply(self, args);
        });
    };
}

/**
 * Constructs a promise method that can be used to safely observe resolution of
 * a promise for an arbitrarily named method like "propfind" in a future turn.
 */
exports.sender = deprecate(sender, "sender", "dispatcher"); // XXX deprecated, use dispatcher
exports.Method = deprecate(sender, "Method", "dispatcher"); // XXX deprecated, use dispatcher
function sender(op) {
    return function (object) {
        var args = array_slice(arguments, 1);
        return send.apply(void 0, [object, op].concat(args));
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param ...args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
exports.send = deprecate(send, "send", "dispatch"); // XXX deprecated, use dispatch
function send(object, op) {
    var deferred = defer();
    var args = array_slice(arguments, 2);
    object = resolve(object);
    nextTick(function () {
        object.promiseSend.apply(
            object,
            [op, deferred.resolve].concat(args)
        );
    });
    return deferred.promise;
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
exports.dispatch = dispatch;
function dispatch(object, op, args) {
    var deferred = defer();
    object = resolve(object);
    nextTick(function () {
        object.promiseSend.apply(
            object,
            [op, deferred.resolve].concat(args)
        );
    });
    return deferred.promise;
}

/**
 * Constructs a promise method that can be used to safely observe resolution of
 * a promise for an arbitrarily named method like "propfind" in a future turn.
 *
 * "dispatcher" constructs methods like "get(promise, name)" and "put(promise)".
 */
exports.dispatcher = dispatcher;
function dispatcher(op) {
    return function (object) {
        var args = array_slice(arguments, 1);
        return dispatch(object, op, args);
    };
}

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
exports.get = dispatcher("get");

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
exports.put = dispatcher("put");

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
exports["delete"] = // XXX experimental
exports.del = dispatcher("del");

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
var post = exports.post = dispatcher("post");

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
exports.invoke = function (value, name) {
    var args = array_slice(arguments, 2);
    return post(value, name, args);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param thisp     the `this` object for the call
 * @param args      array of application arguments
 */
// XXX deprecated, use fapply
var apply = exports.apply = deprecate(dispatcher("apply"), "apply", "fapply");

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
var fapply = exports.fapply = dispatcher("fapply");

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param thisp     the `this` object for the call
 * @param ...args   array of application arguments
 */
// XXX deprecated, use fcall
exports.call = deprecate(call, "call", "fcall");
function call(value, thisp) {
    var args = array_slice(arguments, 2);
    return apply(value, thisp, args);
}

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
exports["try"] = fcall; // XXX experimental
exports.fcall = fcall;
function fcall(value) {
    var args = array_slice(arguments, 1);
    return fapply(value, args);
}

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param thisp   the `this` object for the call
 * @param ...args   array of application arguments
 */
exports.bind = deprecate(bind, "bind", "fbind"); // XXX deprecated, use fbind
function bind(value, thisp) {
    var args = array_slice(arguments, 2);
    return function bound() {
        var allArgs = args.concat(array_slice(arguments));
        return apply(value, thisp, allArgs);
    };
}

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
exports.fbind = fbind;
function fbind(value) {
    var args = array_slice(arguments, 1);
    return function fbound() {
        var allArgs = args.concat(array_slice(arguments));
        return fapply(value, allArgs);
    };
}

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually resolved object
 */
exports.keys = dispatcher("keys");

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
exports.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var countDown = promises.length;
        if (countDown === 0) {
            return resolve(promises);
        }
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            if (isFulfilled(promise)) {
                promises[index] = valueOf(promise);
                if (--countDown === 0) {
                    deferred.resolve(promises);
                }
            } else {
                when(promise, function (value) {
                    promises[index] = value;
                    if (--countDown === 0) {
                        deferred.resolve(promises);
                    }
                })
                .fail(deferred.reject);
            }
        }, void 0);
        return deferred.promise;
    });
}

/**
 * Waits for all promises to be resolved, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
exports.allResolved = allResolved;
function allResolved(promises) {
    return when(promises, function (promises) {
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return array_map(promises, resolve);
        });
    });
}

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
exports["catch"] = // XXX experimental
exports.fail = fail;
function fail(promise, rejected) {
    return when(promise, void 0, rejected);
}

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
exports.progress = progress;
function progress(promise, progressed) {
    return when(promise, void 0, void 0, progressed);
}

/**
 * Provides an opportunity to observe the rejection of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
exports["finally"] = // XXX experimental
exports.fin = fin;
function fin(promise, callback) {
    return when(promise, function (value) {
        return when(callback(), function () {
            return value;
        });
    }, function (exception) {
        return when(callback(), function () {
            return reject(exception);
        });
    });
}

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
exports.end = deprecate(done, "end", "done"); // XXX deprecated, use done
exports.done = done;
function done(promise, fulfilled, rejected, progress) {
    function onUnhandledError(error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        nextTick(function () {
            makeStackTraceLong(error, promise);

            if (exports.onerror) {
                exports.onerror(error);
            } else {
                throw error;
            }
        });
    }

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promiseToHandle = fulfilled || rejected || progress ?
        when(promise, fulfilled, rejected, progress) :
        promise;

    fail(promiseToHandle, onUnhandledError);
}

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
exports.timeout = timeout;
function timeout(promise, ms) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        deferred.reject(new Error("Timed out after " + ms + " ms"));
    }, ms);

    when(promise, function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    });

    return deferred.promise;
}

/**
 * Returns a promise for the given value (or promised value) after some
 * milliseconds.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after some
 * time has elapsed.
 */
exports.delay = delay;
function delay(promise, timeout) {
    if (timeout === void 0) {
        timeout = promise;
        promise = void 0;
    }
    var deferred = defer();
    setTimeout(function () {
        deferred.resolve(promise);
    }, timeout);
    return deferred.promise;
}

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      var readFile = require("fs").readFile;
 *      Q.nfapply(readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
exports.nfapply = nfapply;
function nfapply(callback, args) {
    var nodeArgs = array_slice(args);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());

    fapply(callback, nodeArgs).fail(deferred.reject);
    return deferred.promise;
}

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 *
 *      var readFile = require("fs").readFile;
 *      Q.nfcall(readFile, __filename)
 *      .then(function (content) {
 *      })
 *
 */
exports.nfcall = nfcall;
function nfcall(callback/*, ...args */) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());

    fapply(callback, nodeArgs).fail(deferred.reject);
    return deferred.promise;
}

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 *
 *      Q.nfbind(FS.readFile, __filename)("utf-8")
 *      .then(console.log)
 *      .done()
 *
 */
exports.nfbind = nfbind;
function nfbind(callback/*, ...args */) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());

        fapply(callback, nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
}

/**
 * Passes a continuation to a Node function, which is called with a given
 * `this` value and arguments provided as an array, and returns a promise.
 *
 *      var FS = (require)("fs");
 *      Q.napply(FS.readFile, FS, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
exports.napply = deprecate(napply, "napply", "npost");
function napply(callback, thisp, args) {
    return nbind(callback, thisp).apply(void 0, args);
}

/**
 * Passes a continuation to a Node function, which is called with a given
 * `this` value and arguments provided individually, and returns a promise.
 *
 *      var FS = (require)("fs");
 *      Q.ncall(FS.readFile, FS, __filename)
 *      .then(function (content) {
 *      })
 *
 */
exports.ncall = deprecate(ncall, "ncall", "ninvoke");
function ncall(callback, thisp /*, ...args*/) {
    var args = array_slice(arguments, 2);
    return napply(callback, thisp, args);
}

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 *
 *      Q.nbind(FS.readFile, FS)(__filename)
 *      .then(console.log)
 *      .done()
 *
 */
exports.nbind = deprecate(nbind, "nbind", "nfbind");
function nbind(callback /* thisp, ...args*/) {
    if (arguments.length > 1) {
        var thisp = arguments[1];
        var args = array_slice(arguments, 2);

        var originalCallback = callback;
        callback = function () {
            var combinedArgs = args.concat(array_slice(arguments));
            return originalCallback.apply(thisp, combinedArgs);
        };
    }
    return function () {
        var deferred = defer();
        var args = array_slice(arguments);
        // add a continuation that resolves the promise
        args.push(deferred.makeNodeResolver());
        // trap exceptions thrown by the callback
        fapply(callback, args)
        .fail(deferred.reject);
        return deferred.promise;
    };
}

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
exports.npost = npost;
function npost(object, name, args) {
    var nodeArgs = array_slice(args);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());

    post(object, name, nodeArgs).fail(deferred.reject);
    return deferred.promise;
}

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
exports.ninvoke = ninvoke;
function ninvoke(object, name /*, ...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());

    post(object, name, nodeArgs).fail(deferred.reject);
    return deferred.promise;
}

exports.nend = deprecate(nodeify, "nend", "nodeify"); // XXX deprecated, use nodeify
exports.nodeify = nodeify;
function nodeify(promise, nodeback) {
    if (nodeback) {
        promise.then(function (value) {
            nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return promise;
    }
}

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

});

});

require.define("/src/js/app/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var Constants = require('../util/constants');
var util = require('../util');

/**
 * Globals
 */
var events = _.clone(Backbone.Events);
var commandUI;
var sandbox;
var eventBaton;
var levelArbiter;
var levelDropdown;

///////////////////////////////////////////////////////////////////////

var init = function() {
  /**
    * There is a decent amount of bootstrapping we need just to hook
    * everything up. The init() method takes on these responsibilities,
    * including but not limited to:
    *   - setting up Events and EventBaton
    *   - calling the constructor for the main visualization
    *   - initializing the command input bar
    *   - handling window.focus and zoom events
  **/
  var Sandbox = require('../level/sandbox').Sandbox;
  var Level = require('../level').Level;
  var EventBaton = require('../util/eventBaton').EventBaton;
  var LevelArbiter = require('../level/arbiter').LevelArbiter;
  var LevelDropdownView = require('../views/levelDropdownView').LevelDropdownView;

  eventBaton = new EventBaton();
  commandUI = new CommandUI();
  sandbox = new Sandbox();
  levelArbiter = new LevelArbiter();
  levelDropdown = new LevelDropdownView({
    wait: true
  });

  // we always want to focus the text area to collect input
  var focusTextArea = function() {
    $('#commandTextField').focus();
  };
  focusTextArea();

  $(window).focus(function(e) {
    eventBaton.trigger('windowFocus', e);
  });
  $(document).click(function(e) {
    eventBaton.trigger('documentClick', e);
  });
  $(document).bind('keydown', function(e) {
    eventBaton.trigger('docKeydown', e);
  });
  $(document).bind('keyup', function(e) {
    eventBaton.trigger('docKeyup', e);
  });

  $(window).on('resize', function(e) {
    events.trigger('resize', e);
  });

  $(window).on('resize', _.throttle(function(e) {
    var width = $(window).width();
    var height = $(window).height();
    eventBaton.trigger('windowSizeCheck', {w: width, h: height});
  }, 500));
  eventBaton.stealBaton('docKeydown', function() { });
  eventBaton.stealBaton('docKeyup', function() { });

  /**
    * I am disabling this for now, it works on desktop but is
      hacky on iOS mobile and god knows the behavior on android...
  // zoom level measure, I wish there was a jquery event for this :/
  require('../util/zoomLevel').setupZoomPoll(function(level) {
    eventBaton.trigger('zoomChange', level);
  }, this);

  eventBaton.stealBaton('zoomChange', function(level) {
    if (level > Constants.VIEWPORT.maxZoom ||
        level < Constants.VIEWPORT.minZoom) {
      var Views = require('../views');
      var view = new Views.ZoomAlertWindow({level: level});
    }
  });
  */

  /*
  eventBaton.stealBaton('windowSizeCheck', function(size) {
    if (size.w < Constants.VIEWPORT.minWidth ||
        size.h < Constants.VIEWPORT.minHeight) {
      var Views = require('../views');
      var view = new Views.WindowSizeAlertWindow();
    }
  });*/

  // the default action on window focus and document click is to just focus the text area
  eventBaton.stealBaton('windowFocus', focusTextArea);
  eventBaton.stealBaton('documentClick', focusTextArea);

  // but when the input is fired in the text area, we pipe that to whoever is
  // listenining
  var makeKeyListener = function(name) {
    return function() {
      var args = [name];
      _.each(arguments, function(arg) {
        args.push(arg);
      });
      eventBaton.trigger.apply(eventBaton, args);
    };
  };

  $('#commandTextField').on('keydown', makeKeyListener('keydown'));
  $('#commandTextField').on('keyup', makeKeyListener('keyup'));
  $(window).trigger('resize');

  // demo functionality
  if (/\?demo/.test(window.location.href)) {
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger(
        'commandSubmitted',
        [
          "git commit; git checkout -b bugFix C1; git commit; git merge master; git checkout master; git commit; git rebase bugFix;",
          "delay 1000; reset;",
          "level rebase1 --noFinishDialog --noStartCommand --noIntroDialog;",
          "delay 2000; show goal; delay 1000; hide goal;",
          "git checkout bugFix; git rebase master; git checkout side; git rebase bugFix;",
          "git checkout another; git rebase side; git rebase another master;",
          "help; levels"
        ].join(''));
    });
  } else if (!(/\?NODEMO/.test(window.location.href))) {
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger(
        'commandSubmitted',
        [
          "git help;",
          "delay 1000;",
          "help;",
          "levels"
        ].join(''));
    });
  }
  if (/command=/.test(window.location.href)) {
    var commandRaw = window.location.href.split('command=')[1].split('&')[0];
    var command = unescape(commandRaw);
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger('commandSubmitted', command);
    });
  }
  if (/(iPhone|iPod|iPad).*AppleWebKit/i.test(navigator.userAgent) || /android/i.test(navigator.userAgent)) {
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger('commandSubmitted', 'mobile alert');
    });
  }
};

if (require('../util').isBrowser()) {
  // this file gets included via node sometimes as well
  $(document).ready(init);
}

/**
  * the UI method simply bootstraps the command buffer and
  * command prompt views. It only interacts with user input
  * and simply pipes commands to the main events system
**/
function CommandUI() {
  var Collections = require('../models/collections');
  var CommandViews = require('../views/commandViews');

  this.commandCollection = new Collections.CommandCollection();
  this.commandBuffer = new Collections.CommandBuffer({
    collection: this.commandCollection
  });

  this.commandPromptView = new CommandViews.CommandPromptView({
    el: $('#commandLineBar')
  });

  this.commandLineHistoryView = new CommandViews.CommandLineHistoryView({
    el: $('#commandLineHistory'),
    collection: this.commandCollection
  });
}

exports.getEvents = function() {
  return events;
};

exports.getSandbox = function() {
  return sandbox;
};

exports.getEventBaton = function() {
  return eventBaton;
};

exports.getCommandUI = function() {
  return commandUI;
};

exports.getLevelArbiter = function() {
  return levelArbiter;
};

exports.getLevelDropdown = function() {
  return levelDropdown;
};

exports.init = init;


});

require.define("/src/js/level/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var Q = require('q');

var util = require('../util');
var Main = require('../app');

var Errors = require('../util/errors');
var Sandbox = require('../level/sandbox').Sandbox;
var Constants = require('../util/constants');

var Visualization = require('../visuals/visualization').Visualization;
var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;
var DisabledMap = require('../level/disabledMap').DisabledMap;
var Command = require('../models/commandModel').Command;
var GitShim = require('../git/gitShim').GitShim;

var MultiView = require('../views/multiView').MultiView;
var CanvasTerminalHolder = require('../views').CanvasTerminalHolder;
var ConfirmCancelTerminal = require('../views').ConfirmCancelTerminal;
var NextLevelConfirm = require('../views').NextLevelConfirm;
var LevelToolbar = require('../views').LevelToolbar;

var TreeCompare = require('../git/treeCompare').TreeCompare;

var regexMap = {
  'help level': /^help level$/,
  'start dialog': /^start dialog$/,
  'show goal': /^show goal$/,
  'hide goal': /^hide goal$/,
  'show solution': /^show solution($|\s)/
};

var parse = util.genParseCommand(regexMap, 'processLevelCommand');

var Level = Sandbox.extend({
  initialize: function(options) {
    options = options || {};
    options.level = options.level || {};

    this.level = options.level;

    this.gitCommandsIssued = [];
    this.commandsThatCount = this.getCommandsThatCount();
    this.solved = false;

    this.treeCompare = new TreeCompare();

    this.initGoalData(options);
    this.initName(options);

    Level.__super__.initialize.apply(this, [options]);
    this.startOffCommand();

    this.handleOpen(options.deferred);
  },

  handleOpen: function(deferred) {
    deferred = deferred || Q.defer();

    // if there is a multiview in the beginning, open that
    // and let it resolve our deferred
    if (this.level.startDialog && !this.testOption('noIntroDialog')) {
      new MultiView(_.extend(
        {},
        this.level.startDialog,
        { deferred: deferred }
      ));
      return;
    }

    // otherwise, resolve after a 700 second delay to allow
    // for us to animate easily
    setTimeout(function() {
      deferred.resolve();
    }, this.getAnimationTime() * 1.2);
  },

  startDialog: function(command, deferred) {
    if (!this.level.startDialog) {
      command.set('error', new Errors.GitError({
        msg: 'There is no start dialog to show for this level!'
      }));
      deferred.resolve();
      return;
    }

    this.handleOpen(deferred);
    deferred.promise.then(function() {
      command.set('status', 'finished');
    });
  },

  initName: function() {
    if (!this.level.name) {
      this.level.name = 'Rebase Classic';
      console.warn('REALLY BAD FORM need ids and names');
    }

    this.levelToolbar = new LevelToolbar({
      name: this.level.name
    });
  },

  initGoalData: function(options) {
    if (!this.level.goalTreeString || !this.level.solutionCommand) {
      throw new Error('need goal tree and solution');
    }
  },

  takeControl: function() {
    Main.getEventBaton().stealBaton('processLevelCommand', this.processLevelCommand, this);

    Level.__super__.takeControl.apply(this);
  },

  releaseControl: function() {
    Main.getEventBaton().releaseBaton('processLevelCommand', this.processLevelCommand, this);

    Level.__super__.releaseControl.apply(this);
  },

  startOffCommand: function() {
    if (!this.testOption('noStartCommand')) {
      Main.getEventBaton().trigger(
        'commandSubmitted',
        'hint; delay 2000; show goal'
      );
    }
  },

  initVisualization: function(options) {
    this.mainVis = new Visualization({
      el: options.el || this.getDefaultVisEl(),
      treeString: options.level.startTree
    });

    this.initGoalVisualization();
  },

  initGoalVisualization: function() {
    // first we make the goal visualization holder
    this.goalCanvasHolder = new CanvasTerminalHolder();

    // then we make a visualization. the "el" here is the element to
    // track for size information. the container is where the canvas will be placed
    this.goalVis = new Visualization({
      el: this.goalCanvasHolder.getCanvasLocation(),
      containerElement: this.goalCanvasHolder.getCanvasLocation(),
      treeString: this.level.goalTreeString,
      noKeyboardInput: true,
      noClick: true
    });
  },

  showSolution: function(command, deferred) {
    var toIssue = this.level.solutionCommand;
    var issueFunc = function() {
      Main.getEventBaton().trigger(
        'commandSubmitted',
        toIssue
      );
    };

    var commandStr = command.get('rawStr');
    if (!this.testOptionOnString(commandStr, 'noReset')) {
      toIssue = 'reset; ' + toIssue;
    }
    if (this.testOptionOnString(commandStr, 'force')) {
      issueFunc();
      command.finishWith(deferred);
      return;
    }

    // allow them for force the solution
    var confirmDefer = Q.defer();
    var confirmView = new ConfirmCancelTerminal({
      markdowns: [
        '## Are you sure you want to see the solution?',
        '',
        'I believe in you! You can do it'
      ],
      deferred: confirmDefer
    });

    confirmDefer.promise
    .then(issueFunc)
    .fail(function() {
      command.setResult("Great! I'll let you get back to it");
    })
    .done(function() {
     // either way we animate, so both options can share this logic
     setTimeout(function() {
        command.finishWith(deferred);
      }, confirmView.getAnimationTime());
    });
  },

  showGoal: function(command, defer) {
    this.goalCanvasHolder.slideIn();

    if (!command || !defer) { return; }
    setTimeout(function() {
      command.finishWith(defer);
    }, this.goalCanvasHolder.getAnimationTime());
  },

  hideGoal: function(command, defer) {
    this.goalCanvasHolder.slideOut();
    if (!command || !defer) { return; }

    setTimeout(function() {
      command.finishWith(defer);
    }, this.goalCanvasHolder.getAnimationTime());
  },

  initParseWaterfall: function(options) {
    Level.__super__.initParseWaterfall.apply(this, [options]);

    // add our specific functionaity
    this.parseWaterfall.addFirst(
      'parseWaterfall',
      parse
    );

    this.parseWaterfall.addFirst(
      'instantWaterfall',
      this.getInstantCommands()
    );

    // if we want to disable certain commands...
    if (options.level.disabledMap) {
      // disable these other commands
      this.parseWaterfall.addFirst(
        'instantWaterfall',
        new DisabledMap({
          disabledMap: options.level.disabledMap
        }).getInstantCommands()
      );
    }
  },

  initGitShim: function(options) {
    // ok we definitely want a shim here
    this.gitShim = new GitShim({
      afterCB: _.bind(this.afterCommandCB, this),
      afterDeferHandler: _.bind(this.afterCommandDefer, this)
    });
  },

  getCommandsThatCount: function() {
    var GitCommands = require('../git/commands');
    var toCount = [
      'git commit',
      'git checkout',
      'git rebase',
      'git reset',
      'git branch',
      'git revert',
      'git merge',
      'git cherry-pick'
    ];
    var myRegexMap = {};
    _.each(toCount, function(method) {
      if (!GitCommands.regexMap[method]) { throw new Error('wut no regex'); }

      myRegexMap[method] = GitCommands.regexMap[method];
    });
    return myRegexMap;
  },

  afterCommandCB: function(command) {
    var matched = false;
    _.each(this.commandsThatCount, function(regex) {
      matched = matched || regex.test(command.get('rawStr'));
    });
    if (matched) {
      this.gitCommandsIssued.push(command.get('rawStr'));
    }
  },

  afterCommandDefer: function(defer, command) {
    if (this.solved) {
      command.addWarning(
        "You've already solved this level, try other levels with 'show levels'" +
        "or go back to the sandbox with 'sandbox'"
      );
      defer.resolve();
      return;
    }

    // ok so lets see if they solved it...
    var current = this.mainVis.gitEngine.exportTree();
    var solved;
    if (this.level.compareOnlyMaster) {
      solved = this.treeCompare.compareBranchWithinTrees(current, this.level.goalTreeString, 'master');
    } else if (this.level.compareOnlyBranches) {
      solved = this.treeCompare.compareAllBranchesWithinTrees(current, this.level.goalTreeString);
    } else {
      solved = this.treeCompare.compareAllBranchesWithinTreesAndHEAD(current, this.level.goalTreeString);
    }

    if (!solved) {
      defer.resolve();
      return;
    }

    // woohoo!!! they solved the level, lets animate and such
    this.levelSolved(defer);
  },

  getNumSolutionCommands: function() {
    // strip semicolons in bad places
    var toAnalyze = this.level.solutionCommand.replace(/^;|;$/g, '');
    return toAnalyze.split(';').length;
  },

  testOption: function(option) {
    return this.options.command && new RegExp('--' + option).test(this.options.command.get('rawStr'));
  },

  testOptionOnString: function(str, option) {
    return str && new RegExp('--' + option).test(str);
  },

  levelSolved: function(defer) {
    this.solved = true;
    Main.getEvents().trigger('levelSolved', this.level.id);
    this.hideGoal();

    var nextLevel = Main.getLevelArbiter().getNextLevel(this.level.id);
    var numCommands = this.gitCommandsIssued.length;
    var best = this.getNumSolutionCommands();

    Constants.GLOBAL.isAnimating = true;
    var skipFinishDialog = this.testOption('noFinishDialog');
    var finishAnimationChain = this.mainVis.gitVisuals.finishAnimation();
    if (!skipFinishDialog) {
      finishAnimationChain = finishAnimationChain
      .then(function() {
        // we want to ask if they will move onto the next level
        // while giving them their results...
        var nextDialog = new NextLevelConfirm({
          nextLevel: nextLevel,
          numCommands: numCommands,
          best: best
        });

        return nextDialog.getPromise();
      });
    }

    finishAnimationChain
    .then(function() {
      if (!skipFinishDialog && nextLevel) {
        Main.getEventBaton().trigger(
          'commandSubmitted',
          'level ' + nextLevel.id
        );
      }
    })
    .fail(function() {
      // nothing to do, we will just close
    })
    .done(function() {
      Constants.GLOBAL.isAnimating = false;
      defer.resolve();
    });
  },

  die: function() {
    this.levelToolbar.die();

    this.goalDie();
    this.mainVis.die();
    this.releaseControl();

    this.clear();

    delete this.commandCollection;
    delete this.mainVis;
    delete this.goalVis;
    delete this.goalCanvasHolder;
  },

  goalDie: function() {
    this.goalCanvasHolder.die();
    this.goalVis.die();
  },

  getInstantCommands: function() {
    var hintMsg = (this.level.hint) ?
      this.level.hint :
      "Hmm, there doesn't seem to be a hint for this level :-/";

    return [
      [/^help$|^\?$/, function() {
        throw new Errors.CommandResult({
          msg: 'You are in a level, so multiple forms of help are available. Please select either ' +
               '"help level" or "help general"'
        });
      }],
      [/^hint$/, function() {
        throw new Errors.CommandResult({
          msg: hintMsg
        });
      }]
    ];
  },

  reset: function() {
    this.gitCommandsIssued = [];
    this.solved = false;
    Level.__super__.reset.apply(this, arguments);
  },

  buildLevel: function(command, deferred) {
    this.exitLevel();
    setTimeout(function() {
      Main.getSandbox().buildLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
  },

  importLevel: function(command, deferred) {
    this.exitLevel();
    setTimeout(function() {
      Main.getSandbox().importLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
  },

  startLevel: function(command, deferred) {
    this.exitLevel();

    setTimeout(function() {
      Main.getSandbox().startLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
    // wow! that was simple :D
  },

  exitLevel: function(command, deferred) {
    this.die();

    if (!command || !deferred) {
      return;
    }

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.getAnimationTime());

    // we need to fade in the sandbox
    Main.getEventBaton().trigger('levelExited');
  },

  processLevelCommand: function(command, defer) {
    var methodMap = {
      'show goal': this.showGoal,
      'hide goal': this.hideGoal,
      'show solution': this.showSolution,
      'start dialog': this.startDialog,
      'help level': this.startDialog
    };
    var method = methodMap[command.get('method')];
    if (!method) {
      throw new Error('woah we dont support that method yet', method);
    }

    method.apply(this, [command, defer]);
  }
});

exports.Level = Level;
exports.regexMap = regexMap;

});

require.define("/src/js/util/errors.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var MyError = Backbone.Model.extend({
  defaults: {
    type: 'MyError',
    msg: 'Unknown Error'
  },
  toString: function() {
    return this.get('type') + ': ' + this.get('msg');
  },

  getMsg: function() {
    return this.get('msg') || 'Unknown Error';
  },

  toResult: function() {
    if (!this.get('msg').length) {
      return '';
    }
    return '<p>' + this.get('msg').replace(/\n/g, '</p><p>') + '</p>';
  }
});

var CommandProcessError = exports.CommandProcessError = MyError.extend({
  defaults: {
    type: 'Command Process Error'
  }
});

var CommandResult = exports.CommandResult = MyError.extend({
  defaults: {
    type: 'Command Result'
  }
});

var Warning = exports.Warning = MyError.extend({
  defaults: {
    type: 'Warning'
  }
});

var GitError = exports.GitError = MyError.extend({
  defaults: {
    type: 'Git Error'
  }
});

var filterError = function(err) {
  if (err instanceof CommandProcessError ||
      err instanceof GitError ||
      err instanceof CommandResult ||
      err instanceof Warning) {
    // yay! one of ours
    return;
  } else {
    throw err;
  }
};

exports.filterError = filterError;

});

require.define("/src/js/visuals/visualization.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Collections = require('../models/collections');
var CommitCollection = Collections.CommitCollection;
var BranchCollection = Collections.BranchCollection;
var EventBaton = require('../util/eventBaton').EventBaton;

var GitVisuals = require('../visuals').GitVisuals;

var Visualization = Backbone.View.extend({
  initialize: function(options) {
    options = options || {};
    this.options = options;
    this.customEvents = _.clone(Backbone.Events);
    this.containerElement = options.containerElement;

    var _this = this;
    // we want to add our canvas somewhere
    var container = options.containerElement || $('#canvasHolder')[0];
    new Raphael(container, 200, 200, function() {
      // raphael calls with paper as this for some inane reason...
      var paper = this;
      // use process.nextTick to go from sync to async
      process.nextTick(function() {
        _this.paperInitialize(paper, options);
      });
    });
  },

  paperInitialize: function(paper, options) {
    this.treeString = options.treeString;
    this.paper = paper;

    var Main = require('../app');
    // if we dont want to receive keyoard input (directly),
    // make a new event baton so git engine steals something that no one
    // is broadcasting to
    this.eventBaton = (options.noKeyboardInput) ?
      new EventBaton():
      Main.getEventBaton();

    this.commitCollection = new CommitCollection();
    this.branchCollection = new BranchCollection();

    this.gitVisuals = new GitVisuals({
      commitCollection: this.commitCollection,
      branchCollection: this.branchCollection,
      paper: this.paper,
      noClick: this.options.noClick,
      smallCanvas: this.options.smallCanvas
    });

    var GitEngine = require('../git').GitEngine;
    this.gitEngine = new GitEngine({
      collection: this.commitCollection,
      branches: this.branchCollection,
      gitVisuals: this.gitVisuals,
      eventBaton: this.eventBaton
    });
    this.gitEngine.init();
    this.gitVisuals.assignGitEngine(this.gitEngine);

    this.myResize();

    $(window).on('resize', _.bind(function() {
      this.myResize();
    }, this));

    this.gitVisuals.drawTreeFirstTime();
    if (this.treeString) {
      this.gitEngine.loadTreeFromString(this.treeString);
    }
    if (this.options.zIndex) {
      this.setTreeIndex(this.options.zIndex);
    }

    this.shown = false;
    this.setTreeOpacity(0);
    // reflow needed
    process.nextTick(_.bind(this.fadeTreeIn, this));

    this.customEvents.trigger('gitEngineReady');
    this.customEvents.trigger('paperReady');
  },

  setTreeIndex: function(level) {
    $(this.paper.canvas).css('z-index', level);
  },

  setTreeOpacity: function(level) {
    if (level === 0) {
      this.shown = false;
    }

    $(this.paper.canvas).css('opacity', level);
  },

  getAnimationTime: function() { return 300; },

  fadeTreeIn: function() {
    this.shown = true;
    $(this.paper.canvas).animate({opacity: 1}, this.getAnimationTime());
  },

  fadeTreeOut: function() {
    this.shown = false;
    $(this.paper.canvas).animate({opacity: 0}, this.getAnimationTime());
  },

  hide: function() {
    this.fadeTreeOut();
    // remove click handlers by toggling visibility
    setTimeout(_.bind(function() {
      $(this.paper.canvas).css('visibility', 'hidden');
    }, this), this.getAnimationTime());
  },

  show: function() {
    $(this.paper.canvas).css('visibility', 'visible');
    setTimeout(_.bind(this.fadeTreeIn, this), 10);
  },

  showHarsh: function() {
    $(this.paper.canvas).css('visibility', 'visible');
    this.setTreeOpacity(1);
  },

  resetFromThisTreeNow: function(treeString) {
    this.treeString = treeString;
  },

  reset: function() {
    this.setTreeOpacity(0);
    if (this.treeString) {
      this.gitEngine.loadTreeFromString(this.treeString);
    } else {
      this.gitEngine.defaultInit();
    }
    this.fadeTreeIn();
  },

  tearDown: function() {
    this.gitEngine.tearDown();
    this.gitVisuals.tearDown();
    delete this.paper;
  },

  die: function() {
    this.fadeTreeOut();
    setTimeout(_.bind(function() {
      if (!this.shown) {
        this.tearDown();
      }
    }, this), this.getAnimationTime());
  },

  myResize: function() {
    if (!this.paper) { return; }

    var smaller = 1;
    var el = this.el;

    var width = el.clientWidth - smaller;
    var height = el.clientHeight - smaller;

    // if we don't have a container, we need to set our
    // position absolutely to whatever we are tracking
    if (!this.containerElement) {
      var left = el.offsetLeft;
      var top = el.offsetTop;

      $(this.paper.canvas).css({
        position: 'absolute',
        left: left + 'px',
        top: top + 'px'
      });
    }

    this.paper.setSize(width, height);
    this.gitVisuals.canvasResize(width, height);
  }
});

exports.Visualization = Visualization;


});

require.define("/src/js/models/collections.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Commit = require('../git').Commit;
var Branch = require('../git').Branch;

var Command = require('../models/commandModel').Command;
var CommandEntry = require('../models/commandModel').CommandEntry;
var TIME = require('../util/constants').TIME;

var CommitCollection = Backbone.Collection.extend({
  model: Commit
});

var CommandCollection = Backbone.Collection.extend({
  model: Command
});

var BranchCollection = Backbone.Collection.extend({
  model: Branch
});

var CommandEntryCollection = Backbone.Collection.extend({
  model: CommandEntry,
  localStorage: (Backbone.LocalStorage) ? new Backbone.LocalStorage('CommandEntries') : null
});

var CommandBuffer = Backbone.Model.extend({
  defaults: {
    collection: null
  },

  initialize: function(options) {
    options.collection.bind('add', this.addCommand, this);

    this.buffer = [];
    this.timeout = null;
  },

  addCommand: function(command) {
    this.buffer.push(command);
    this.touchBuffer();
  },

  touchBuffer: function() {
    // touch buffer just essentially means we just check if our buffer is being
    // processed. if it's not, we immediately process the first item
    // and then set the timeout.
    if (this.timeout) {
      // timeout existence implies its being processed
      return;
    }
    this.setTimeout();
  },


  setTimeout: function() {
    this.timeout = setTimeout(_.bind(function() {
        this.sipFromBuffer();
    }, this), TIME.betweenCommandsDelay);
  },

  popAndProcess: function() {
    var popped = this.buffer.shift(0);

    // find a command with no error (aka unprocessed)
    while (popped.get('error') && this.buffer.length) {
      popped = this.buffer.shift(0);
    }
    if (!popped.get('error')) {
      this.processCommand(popped);
    } else {
      // no more commands to process
      this.clear();
    }
  },

  processCommand: function(command) {
    command.set('status', 'processing');

    var deferred = Q.defer();
    deferred.promise.then(_.bind(function() {
      this.setTimeout();
    }, this));

    var eventName = command.get('eventName');
    if (!eventName) {
      throw new Error('I need an event to trigger when this guy is parsed and ready');
    }

    var Main = require('../app');
    var eventBaton = Main.getEventBaton();

    var numListeners = eventBaton.getNumListeners(eventName);
    if (!numListeners) {
      var Errors = require('../util/errors');
      command.set('error', new Errors.GitError({
        msg: 'That command is valid, but not supported in this current environment!' +
             ' Try entering a level or level builder to use that command'
      }));
      deferred.resolve();
      return;
    }

    Main.getEventBaton().trigger(eventName, command, deferred);
  },

  clear: function() {
    clearTimeout(this.timeout);
    this.timeout = null;
  },

  sipFromBuffer: function() {
    if (!this.buffer.length) {
      this.clear();
      return;
    }

    this.popAndProcess();
  }
});

exports.CommitCollection = CommitCollection;
exports.CommandCollection = CommandCollection;
exports.BranchCollection = BranchCollection;
exports.CommandEntryCollection = CommandEntryCollection;
exports.CommandBuffer = CommandBuffer;


});

require.define("/src/js/git/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;
var Q = require('q');

var AnimationFactoryModule = require('../visuals/animation/animationFactory');
var AnimationQueue = require('../visuals/animation').AnimationQueue;
var TreeCompare = require('./treeCompare').TreeCompare;

var Errors = require('../util/errors');
var GitError = Errors.GitError;
var CommandResult = Errors.CommandResult;

function GitEngine(options) {
  this.rootCommit = null;
  this.refs = {};
  this.HEAD = null;

  this.branchCollection = options.branches;
  this.commitCollection = options.collection;
  this.gitVisuals = options.gitVisuals;

  this.eventBaton = options.eventBaton;
  this.eventBaton.stealBaton('processGitCommand', this.dispatch, this);

  this.animationFactory = options.animationFactory ||
    new AnimationFactoryModule.AnimationFactory();

  // global variable to keep track of the options given
  // along with the command call.
  this.commandOptions = {};
  this.generalArgs = [];

  this.initUniqueID();
}

GitEngine.prototype.initUniqueID = function() {
  // backbone or something uses _.uniqueId, so we make our own here
  this.uniqueId = (function() {
    var n = 0;
    return function(prepend) {
      return prepend? prepend + n++ : n++;
    };
  })();
};

GitEngine.prototype.defaultInit = function() {
  var defaultTree = JSON.parse(unescape("%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C1%22%2C%22id%22%3A%22master%22%2C%22type%22%3A%22branch%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22type%22%3A%22commit%22%2C%22parents%22%3A%5B%5D%2C%22author%22%3A%22Peter%20Cottle%22%2C%22createTime%22%3A%22Mon%20Nov%2005%202012%2000%3A56%3A47%20GMT-0800%20%28PST%29%22%2C%22commitMessage%22%3A%22Quick%20Commit.%20Go%20Bears%21%22%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22type%22%3A%22commit%22%2C%22parents%22%3A%5B%22C0%22%5D%2C%22author%22%3A%22Peter%20Cottle%22%2C%22createTime%22%3A%22Mon%20Nov%2005%202012%2000%3A56%3A47%20GMT-0800%20%28PST%29%22%2C%22commitMessage%22%3A%22Quick%20Commit.%20Go%20Bears%21%22%2C%22id%22%3A%22C1%22%7D%7D%2C%22HEAD%22%3A%7B%22id%22%3A%22HEAD%22%2C%22target%22%3A%22master%22%2C%22type%22%3A%22general%20ref%22%7D%7D"));
  this.loadTree(defaultTree);
};

GitEngine.prototype.init = function() {
  // make an initial commit and a master branch
  this.rootCommit = this.makeCommit(null, null, {rootCommit: true});
  this.commitCollection.add(this.rootCommit);

  var master = this.makeBranch('master', this.rootCommit);
  this.HEAD = new Ref({
    id: 'HEAD',
    target: master
  });
  this.refs[this.HEAD.get('id')] = this.HEAD;

  // commit once to get things going
  this.commit();
};

GitEngine.prototype.exportTree = function() {
  // need to export all commits, their connectivity / messages, branches, and state of head.
  // this would be simple if didn't have circular structures.... :P
  // thus, we need to loop through and "flatten" our graph of objects referencing one another
  var totalExport = {
    branches: {},
    commits: {},
    HEAD: null
  };

  _.each(this.branchCollection.toJSON(), function(branch) {
    branch.target = branch.target.get('id');
    branch.visBranch = undefined;

    totalExport.branches[branch.id] = branch;
  });

  _.each(this.commitCollection.toJSON(), function(commit) {
    // clear out the fields that reference objects and create circular structure
    _.each(Commit.prototype.constants.circularFields, function(field) {
      commit[field] = undefined;
    }, this);

    // convert parents
    var parents = [];
    _.each(commit.parents, function(par) {
      parents.push(par.get('id'));
    });
    commit.parents = parents;

    totalExport.commits[commit.id] = commit;
  }, this);

  var HEAD = this.HEAD.toJSON();
  HEAD.visBranch = undefined;
  HEAD.lastTarget = HEAD.lastLastTarget = HEAD.visBranch = undefined;
  HEAD.target = HEAD.target.get('id');
  totalExport.HEAD = HEAD;

  return totalExport;
};

GitEngine.prototype.printTree = function(tree) {
  tree = tree || this.exportTree();
  TreeCompare.prototype.reduceTreeFields([tree]);

  var str = JSON.stringify(tree);
  if (/'/.test(str)) {
    // escape it to make it more copy paste friendly
    str = escape(str);
  }
  return str;
};

GitEngine.prototype.printAndCopyTree = function() {
  window.prompt('Copy the tree string below', this.printTree());
};

GitEngine.prototype.loadTree = function(tree) {
  // deep copy in case we use it a bunch
  tree = $.extend(true, {}, tree);

  // first clear everything
  this.removeAll();

  this.instantiateFromTree(tree);

  this.reloadGraphics();
  this.initUniqueID();
};

GitEngine.prototype.loadTreeFromString = function(treeString) {
  this.loadTree(JSON.parse(unescape(treeString)));
};

GitEngine.prototype.instantiateFromTree = function(tree) {
  // now we do the loading part
  var createdSoFar = {};

  _.each(tree.commits, function(commitJSON) {
    var commit = this.getOrMakeRecursive(tree, createdSoFar, commitJSON.id);
    this.commitCollection.add(commit);
  }, this);

  _.each(tree.branches, function(branchJSON) {
    var branch = this.getOrMakeRecursive(tree, createdSoFar, branchJSON.id);

    this.branchCollection.add(branch, {silent: true});
  }, this);

  var HEAD = this.getOrMakeRecursive(tree, createdSoFar, tree.HEAD.id);
  this.HEAD = HEAD;

  this.rootCommit = createdSoFar['C0'];
  if (!this.rootCommit) {
    throw new Error('Need root commit of C0 for calculations');
  }
  this.refs = createdSoFar;

  this.gitVisuals.gitReady = false;
  this.branchCollection.each(function(branch) {
    this.gitVisuals.addBranch(branch);
  }, this);
};

GitEngine.prototype.reloadGraphics = function() {
  // get the root commit
  this.gitVisuals.rootCommit = this.refs['C0'];
  // this just basically makes the HEAD branch. the head branch really should have been
  // a member of a collection and not this annoying edge case stuff... one day
  this.gitVisuals.initHeadBranch();

  // when the paper is ready
  this.gitVisuals.drawTreeFromReload();

  this.gitVisuals.refreshTreeHarsh();
};

GitEngine.prototype.getOrMakeRecursive = function(tree, createdSoFar, objID) {
  if (createdSoFar[objID]) {
    // base case
    return createdSoFar[objID];
  }

  var getType = function(tree, id) {
    if (tree.commits[id]) {
      return 'commit';
    } else if (tree.branches[id]) {
      return 'branch';
    } else if (id == 'HEAD') {
      return 'HEAD';
    }
    throw new Error("bad type for " + id);
  };

  // figure out what type
  var type = getType(tree, objID);

  if (type == 'HEAD') {
    var headJSON = tree.HEAD;
    var HEAD = new Ref(_.extend(
      tree.HEAD,
      {
        target: this.getOrMakeRecursive(tree, createdSoFar, headJSON.target)
      }
    ));
    createdSoFar[objID] = HEAD;
    return HEAD;
  }

  if (type == 'branch') {
    var branchJSON = tree.branches[objID];

    var branch = new Branch(_.extend(
      tree.branches[objID],
      {
        target: this.getOrMakeRecursive(tree, createdSoFar, branchJSON.target)
      }
    ));
    createdSoFar[objID] = branch;
    return branch;
  }

  if (type == 'commit') {
    // for commits, we need to grab all the parents
    var commitJSON = tree.commits[objID];

    var parentObjs = [];
    _.each(commitJSON.parents, function(parentID) {
      parentObjs.push(this.getOrMakeRecursive(tree, createdSoFar, parentID));
    }, this);

    var commit = new Commit(_.extend(
      commitJSON,
      {
        parents: parentObjs,
        gitVisuals: this.gitVisuals
      }
    ));
    createdSoFar[objID] = commit;
    return commit;
  }

  throw new Error('ruh rho!! unsupported tyep for ' + objID);
};

GitEngine.prototype.tearDown = function() {
  this.eventBaton.releaseBaton('processGitCommand', this.dispatch, this);
  this.removeAll();
};

GitEngine.prototype.removeAll = function() {
  this.branchCollection.reset();
  this.commitCollection.reset();
  this.refs = {};
  this.HEAD = null;
  this.rootCommit = null;

  this.gitVisuals.resetAll();
};

GitEngine.prototype.getDetachedHead = function() {
  // detached head is if HEAD points to a commit instead of a branch...
  var target = this.HEAD.get('target');
  var targetType = target.get('type');
  return targetType !== 'branch';
};

GitEngine.prototype.validateBranchName = function(name) {
  name = name.replace(/\s/g, '');
  if (!/^[a-zA-Z0-9]+$/.test(name)) {
    throw new GitError({
      msg: 'woah bad branch name!! This is not ok: ' + name
    });
  }
  if (/[hH][eE][aA][dD]/.test(name)) {
    throw new GitError({
      msg: 'branch name of "head" is ambiguous, dont name it that'
    });
  }
  if (name.length > 9) {
    name = name.slice(0, 9);
    this.command.addWarning(
      'Sorry, we need to keep branch names short for the visuals. Your branch ' +
      'name was truncated to 9 characters, resulting in ' + name
    );
  }
  return name;
};

GitEngine.prototype.makeBranch = function(id, target) {
  id = this.validateBranchName(id);
  if (this.refs[id]) {
    throw new GitError({
      msg: 'that branch id either matches a commit hash or already exists!'
    });
  }

  var branch = new Branch({
    target: target,
    id: id
  });
  this.branchCollection.add(branch);
  this.refs[branch.get('id')] = branch;
  return branch;
};

GitEngine.prototype.getHead = function() {
  return _.clone(this.HEAD);
};

GitEngine.prototype.getBranches = function() {
  var toReturn = [];
  this.branchCollection.each(function(branch) {
    toReturn.push({
      id: branch.get('id'),
      selected: this.HEAD.get('target') === branch,
      target: branch.get('target'),
      obj: branch
    });
  }, this);
  return toReturn;
};

GitEngine.prototype.printBranchesWithout = function(without) {
  var commitToBranches = this.getUpstreamBranchSet();
  var commitID = this.getCommitFromRef(without).get('id');

  var toPrint = [];
  _.each(commitToBranches[commitID], function(branchJSON) {
    branchJSON.selected = this.HEAD.get('target').get('id') == branchJSON.id;
    toPrint.push(branchJSON);
  }, this);
  this.printBranches(toPrint);
};

GitEngine.prototype.printBranches = function(branches) {
  var result = '';
  _.each(branches, function(branch) {
    result += (branch.selected ? '* ' : '') + branch.id + '\n';
  });
  throw new CommandResult({
    msg: result
  });
};

GitEngine.prototype.makeCommit = function(parents, id, options) {
  // ok we need to actually manually create commit IDs now because
  // people like nikita (thanks for finding this!) could
  // make branches named C2 before creating the commit C2
  if (!id) {
    id = this.uniqueId('C');
    while (this.refs[id]) {
      id = this.uniqueId('C');
    }
  }

  var commit = new Commit(_.extend({
      parents: parents,
      id: id,
      gitVisuals: this.gitVisuals
    },
    options || {}
  ));

  this.refs[commit.get('id')] = commit;
  this.commitCollection.add(commit);
  return commit;
};

GitEngine.prototype.acceptNoGeneralArgs = function() {
  if (this.generalArgs.length) {
    throw new GitError({
      msg: "That command accepts no general arguments"
    });
  }
};

GitEngine.prototype.validateArgBounds = function(args, lower, upper, option) {
  // this is a little utility class to help arg validation that happens over and over again
  var what = (option === undefined) ?
    'git ' + this.command.get('method') :
    this.command.get('method') + ' ' + option + ' ';
  what = 'with ' + what;

  if (args.length < lower) {
    throw new GitError({
      msg: 'I expect at least ' + String(lower) + ' argument(s) ' + what
    });
  }
  if (args.length > upper) {
    throw new GitError({
      msg: 'I expect at most ' + String(upper) + ' argument(s) ' + what
    });
  }
};

GitEngine.prototype.oneArgImpliedHead = function(args, option) {
  // for log, show, etc
  this.validateArgBounds(args, 0, 1, option);
  if (args.length === 0) {
    args.push('HEAD');
  }
};

GitEngine.prototype.twoArgsImpliedHead = function(args, option) {
  // our args we expect to be between 1 and 2
  this.validateArgBounds(args, 1, 2, option);
  // and if it's one, add a HEAD to the back
  if (args.length == 1) {
    args.push('HEAD');
  }
};

GitEngine.prototype.revertStarter = function() {
  this.validateArgBounds(this.generalArgs, 1, NaN);

  var response = this.revert(this.generalArgs);

  if (response) {
    this.animationFactory.rebaseAnimation(this.animationQueue, response, this, this.gitVisuals);
  }
};

GitEngine.prototype.revert = function(whichCommits) {
  // for each commit, we want to revert it
  var toRebase = [];
  _.each(whichCommits, function(stringRef) {
    toRebase.push(this.getCommitFromRef(stringRef));
  }, this);

  // we animate reverts now!! we use the rebase animation though so that's
  // why the terminology is like it is
  var animationResponse = {};
  animationResponse.destinationBranch = this.resolveID(toRebase[0]);
  animationResponse.toRebaseArray = toRebase.slice(0);
  animationResponse.rebaseSteps = [];

  var beforeSnapshot = this.gitVisuals.genSnapshot();
  var afterSnapshot;

  // now make a bunch of commits on top of where we are
  var base = this.getCommitFromRef('HEAD');
  _.each(toRebase, function(oldCommit) {
    var newId = this.rebaseAltID(oldCommit.get('id'));

    var newCommit = this.makeCommit([base], newId, {
        commitMessage: 'Reverting ' + this.resolveName(oldCommit) +
          ': "' + oldCommit.get('commitMessage') + '"'
    });

    base = newCommit;

    // animation stuff
    afterSnapshot = this.gitVisuals.genSnapshot();
    animationResponse.rebaseSteps.push({
      oldCommit: oldCommit,
      newCommit: newCommit,
      beforeSnapshot: beforeSnapshot,
      afterSnapshot: afterSnapshot
    });
    beforeSnapshot = afterSnapshot;
  }, this);
  // done! update our location
  this.setTargetLocation('HEAD', base);

  // animation
  return animationResponse;
};

GitEngine.prototype.resetStarter = function() {
  if (this.commandOptions['--soft']) {
    throw new GitError({
      msg: "You can't use --soft because there is no concept of stashing" +
           " changes or staging files, so you will lose your progress." +
           " Try using interactive rebasing (or just rebasing) to move commits."
    });
  }
  if (this.commandOptions['--hard']) {
    this.command.addWarning(
      'Nice! You are using --hard. The default behavior is a hard reset in ' +
      "this demo, so don't worry about specifying the option explicity"
    );
    // dont absorb the arg off of --hard
    this.generalArgs = this.generalArgs.concat(this.commandOptions['--hard']);
  }

  this.validateArgBounds(this.generalArgs, 1, 1);

  if (this.getDetachedHead()) {
    throw new GitError({
      msg: "Cant reset in detached head! Use checkout if you want to move"
    });
  }

  this.reset(this.generalArgs[0]);
};

GitEngine.prototype.reset = function(target) {
  this.setTargetLocation('HEAD', this.getCommitFromRef(target));
};

GitEngine.prototype.cherrypickStarter = function() {
  this.validateArgBounds(this.generalArgs, 1, 1);
  var newCommit = this.cherrypick(this.generalArgs[0]);

  this.animationFactory.genCommitBirthAnimation(this.animationQueue, newCommit, this.gitVisuals);
};

GitEngine.prototype.cherrypick = function(ref) {
  var commit = this.getCommitFromRef(ref);
  // check if we already have that
  var set = this.getUpstreamSet('HEAD');
  if (set[commit.get('id')]) {
    throw new GitError({
      msg: "We already have that commit in our changes history! You can't cherry-pick it " +
           "if it shows up in git log."
    });
  }

  // alter the ID slightly
  var id = this.rebaseAltID(commit.get('id'));

  // now commit with that id onto HEAD
  var newCommit = this.makeCommit([this.getCommitFromRef('HEAD')], id);
  this.setTargetLocation(this.HEAD, newCommit);
  return newCommit;
};

GitEngine.prototype.commitStarter = function() {
  this.acceptNoGeneralArgs();
  if (this.commandOptions['-am'] && (
      this.commandOptions['-a'] || this.commandOptions['-m'])) {
    throw new GitError({
      msg: "You can't have -am with another -m or -a!"
    });
  }

  var msg = null;
  var args = null;
  if (this.commandOptions['-a']) {
    this.command.addWarning('No need to add files in this demo');
  }

  if (this.commandOptions['-am']) {
    args = this.commandOptions['-am'];
    this.validateArgBounds(args, 1, 1, '-am');

    this.command.addWarning("Don't worry about adding files in this demo. I'll take " +
      "down your commit message anyways, but you can commit without a message " +
      "in this demo as well");
    msg = args[0];
  }

  if (this.commandOptions['-m']) {
    args = this.commandOptions['-m'];
    this.validateArgBounds(args, 1, 1, '-m');
    msg = args[0];
  }

  var newCommit = this.commit();
  if (msg) {
    msg = msg
      .replace(/&quot;/g, '"')
      .replace(/^"/g, '')
      .replace(/"$/g, '');

    newCommit.set('commitMessage', msg);
  }
  this.animationFactory.genCommitBirthAnimation(this.animationQueue, newCommit, this.gitVisuals);
};

GitEngine.prototype.commit = function() {
  var targetCommit = this.getCommitFromRef(this.HEAD);
  var id = null;

  // if we want to ammend, go one above
  if (this.commandOptions['--amend']) {
    targetCommit = this.resolveID('HEAD~1');
    id = this.rebaseAltID(this.getCommitFromRef('HEAD').get('id'));
  }

  var newCommit = this.makeCommit([targetCommit], id);
  if (this.getDetachedHead()) {
    this.command.addWarning('Warning!! Detached HEAD state');
  }

  this.setTargetLocation(this.HEAD, newCommit);
  return newCommit;
};

GitEngine.prototype.resolveName = function(someRef) {
  // first get the obj
  var obj = this.resolveID(someRef);
  if (obj.get('type') == 'commit') {
    return 'commit ' + obj.get('id');
  }
  if (obj.get('type') == 'branch') {
    return 'branch "' + obj.get('id') + '"';
  }
  // we are dealing with HEAD
  return this.resolveName(obj.get('target'));
};

GitEngine.prototype.resolveID = function(idOrTarget) {
  if (idOrTarget === null || idOrTarget === undefined) {
    throw new Error('Dont call this with null / undefined');
  }

  if (typeof idOrTarget !== 'string') {
    return idOrTarget;
  }
  return this.resolveStringRef(idOrTarget);
};

GitEngine.prototype.resolveStringRef = function(ref) {
  if (this.refs[ref]) {
    return this.refs[ref];
  }

  // may be something like HEAD~2 or master^^
  var relativeRefs = [
    [/^([a-zA-Z0-9]+)~(\d+)\s*$/, function(matches) {
      return parseInt(matches[2], 10);
    }],
    [/^([a-zA-Z0-9]+)(\^+)\s*$/, function(matches) {
      return matches[2].length;
    }]
  ];

  var startRef = null;
  var numBack = null;
  _.each(relativeRefs, function(config) {
    var regex = config[0];
    var parse = config[1];
    if (regex.test(ref)) {
      var matches = regex.exec(ref);
      numBack = parse(matches);
      startRef = matches[1];
    }
  }, this);

  if (!startRef) {
    throw new GitError({
      msg: 'unknown ref ' + ref
    });
  }
  if (!this.refs[startRef]) {
    throw new GitError({
      msg: 'the ref ' + startRef +' does not exist.'
    });
  }
  var commit = this.getCommitFromRef(startRef);

  return this.numBackFrom(commit, numBack);
};

GitEngine.prototype.getCommitFromRef = function(ref) {
  var start = this.resolveID(ref);

  // works for both HEAD and just a single layer. aka branch
  while (start.get('type') !== 'commit') {
    start = start.get('target');
  }
  return start;
};

GitEngine.prototype.getType = function(ref) {
  return this.resolveID(ref).get('type');
};

GitEngine.prototype.setTargetLocation = function(ref, target) {
  if (this.getType(ref) == 'commit') {
    // nothing to do
    return;
  }

  // sets whatever ref is (branch, HEAD, etc) to a target. so if
  // you pass in HEAD, and HEAD is pointing to a branch, it will update
  // the branch to that commit, not the HEAD
  ref = this.getOneBeforeCommit(ref);
  ref.set('target', target);
};

GitEngine.prototype.getUpstreamBranchSet = function() {
  // this is expensive!! so only call once in a while
  var commitToSet = {};

  var inArray = function(arr, id) {
    var found = false;
    _.each(arr, function(wrapper) {
      if (wrapper.id == id) {
        found = true;
      }
    });

    return found;
  };

  var bfsSearch = function(commit) {
    var set = [];
    var pQueue = [commit];
    while (pQueue.length) {
      var popped = pQueue.pop();
      set.push(popped.get('id'));

      if (popped.get('parents') && popped.get('parents').length) {
        pQueue = pQueue.concat(popped.get('parents'));
      }
    }
    return set;
  };

  this.branchCollection.each(function(branch) {
    var set = bfsSearch(branch.get('target'));
    _.each(set, function(id) {
      commitToSet[id] = commitToSet[id] || [];

      // only add it if it's not there, so hue blending is ok
      if (!inArray(commitToSet[id], branch.get('id'))) {
        commitToSet[id].push({
          obj: branch,
          id: branch.get('id')
        });
      }
    });
  });

  return commitToSet;
};

GitEngine.prototype.getUpstreamHeadSet = function() {
  var set = this.getUpstreamSet('HEAD');
  var including = this.getCommitFromRef('HEAD').get('id');

  set[including] = true;
  return set;
};

GitEngine.prototype.getOneBeforeCommit = function(ref) {
  // you can call this command on HEAD in detached, HEAD, or on a branch
  // and it will return the ref that is one above a commit. aka
  // it resolves HEAD to something that we can move the ref with
  var start = this.resolveID(ref);
  if (start === this.HEAD && !this.getDetachedHead()) {
    start = start.get('target');
  }
  return start;
};

GitEngine.prototype.numBackFrom = function(commit, numBack) {
  // going back '3' from a given ref is not trivial, for you might have
  // a bunch of merge commits and such. like this situation:
  //
  //      * merge master into new
  //      |\
  //      | \* commit here
  //      |* \ commit there
  //      |  |* commit here
  //      \ /
  //       | * root
  //
  //
  // hence we need to do a BFS search, with the commit date being the
  // value to sort off of (rather than just purely the level)
  if (numBack === 0) {
    return commit;
  }

  // we use a special sorting function here that
  // prefers the later commits over the earlier ones
  var sortQueue = _.bind(function(queue) {
    queue.sort(this.dateSortFunc);
  }, this);

  var pQueue = [].concat(commit.get('parents') || []);
  sortQueue(pQueue);
  numBack--;

  while (pQueue.length && numBack !== 0) {
    var popped = pQueue.shift(0);
    var parents = popped.get('parents');

    if (parents && parents.length) {
      pQueue = pQueue.concat(parents);
    }

    sortQueue(pQueue);
    numBack--;
  }

  if (numBack !== 0 || pQueue.length === 0) {
    throw new GitError({
      msg: "Sorry, I can't go that many commits back"
    });
  }
  return pQueue.shift(0);
};

GitEngine.prototype.scrapeBaseID = function(id) {
  var results = /^C(\d+)/.exec(id);

  if (!results) {
    throw new Error('regex failed on ' + id);
  }

  return 'C' + results[1];
};

GitEngine.prototype.rebaseAltID = function(id) {
  // this function alters an ID to add a quote to the end,
  // indicating that it was rebased. it also checks existence
  var regexMap = [
    [/^C(\d+)[']{0,2}$/, function(bits) {
      // this id can use another quote, so just add it
      return bits[0] + "'";
    }],
    [/^C(\d+)[']{3}$/, function(bits) {
      // here we switch from C''' to C'^4
      return bits[0].slice(0, -3) + "'^4";
    }],
    [/^C(\d+)['][\^](\d+)$/, function(bits) {
      return 'C' + String(bits[1]) + "'^" + String(Number(bits[2]) + 1);
    }]
  ];

  for (var i = 0; i < regexMap.length; i++) {
    var regex = regexMap[i][0];
    var func = regexMap[i][1];
    var results = regex.exec(id);
    if (results) {
      var newId = func(results);
      // if this id exists, continue down the rabbit hole
      if (this.refs[newId]) {
        return this.rebaseAltID(newId);
      } else {
        return newId;
      }
    }
  }
  throw new Error('could not modify the id ' + id);
};

GitEngine.prototype.idSortFunc = function(cA, cB) {
  // commit IDs can come in many forms:
  //  C4
  //  C4' (from a rebase)
  //  C4'' (from multiple rebases)
  //  C4'^3 (from a BUNCH of rebases)

  var scale = 1000;

  var regexMap = [
    [/^C(\d+)$/, function(bits) {
      // return the 4 from C4
      return scale * bits[1];
    }],
    [/^C(\d+)([']+)$/, function(bits) {
      // return the 4 from C4, plus the length of the quotes
      return scale * bits[1] + bits[2].length;
    }],
    [/^C(\d+)['][\^](\d+)$/, function(bits) {
      return scale * bits[1] + Number(bits[2]);
    }]
  ];

  var getNumToSort = function(id) {
    for (var i = 0; i < regexMap.length; i++) {
      var regex = regexMap[i][0];
      var func = regexMap[i][1];
      var results = regex.exec(id);
      if (results) {
        return func(results);
      }
    }
    throw new Error('Could not parse commit ID ' + id);
  };

  return getNumToSort(cA.get('id')) - getNumToSort(cB.get('id'));
};

GitEngine.prototype.dateSortFunc = function(cA, cB) {
  var dateA = new Date(cA.get('createTime'));
  var dateB = new Date(cB.get('createTime'));
  if (dateA - dateB === 0) {
    // hmmmmm this still needs fixing. we need to know basically just WHEN a commit was created, but since
    // we strip off the date creation field, when loading a tree from string this fails :-/
    // there's actually no way to determine it...
    //console.warn('WUT it is equal');
    //console.log(cA, cB);
    return GitEngine.prototype.idSortFunc(cA, cB);
  }
  return dateA - dateB;
};

GitEngine.prototype.rebaseInteractiveStarter = function() {
  var args = this.commandOptions['-i'];
  this.twoArgsImpliedHead(args, ' -i');

  this.rebaseInteractive(args[0], args[1]);
};

GitEngine.prototype.rebaseStarter = function() {
  if (this.commandOptions['-i']) {
    this.rebaseInteractiveStarter();
    return;
  }

  this.twoArgsImpliedHead(this.generalArgs);

  var response = this.rebase(this.generalArgs[0], this.generalArgs[1]);

  if (response === undefined) {
    // was a fastforward or already up to date. returning now
    // will trigger the refresh animation by not adding anything to
    // the animation queue
    return;
  }

  this.animationFactory.rebaseAnimation(this.animationQueue, response, this, this.gitVisuals);
};

GitEngine.prototype.rebase = function(targetSource, currentLocation) {
  // first some conditions
  if (this.isUpstreamOf(targetSource, currentLocation)) {
    this.command.setResult('Branch already up-to-date');

    // git for some reason always checks out the branch you are rebasing,
    // no matter the result of the rebase
    this.checkout(currentLocation);

    // returning instead of throwing makes a tree refresh
    return;
  }

  if (this.isUpstreamOf(currentLocation, targetSource)) {
    // just set the target of this current location to the source
    this.setTargetLocation(currentLocation, this.getCommitFromRef(targetSource));
    // we need the refresh tree animation to happen, so set the result directly
    // instead of throwing
    this.command.setResult('Fast-forwarding...');

    this.checkout(currentLocation);
    return;
  }

   // now the part of actually rebasing.
  // We need to get the downstream set of targetSource first.
  // then we BFS from currentLocation, using the downstream set as our stopping point.
  // we need to BFS because we need to include all commits below
  // pop these commits on top of targetSource and modify their ids with quotes
  var stopSet = this.getUpstreamSet(targetSource);

  // now BFS from here on out
  var toRebaseRough = [];
  var pQueue = [this.getCommitFromRef(currentLocation)];

  while (pQueue.length) {
    var popped = pQueue.pop();

    // if its in the set, dont add it
    if (stopSet[popped.get('id')]) {
      continue;
    }

    // it's not in the set, so we need to rebase this commit
    toRebaseRough.push(popped);
    toRebaseRough.sort(this.dateSortFunc);

    // keep searching
    pQueue = pQueue.concat(popped.get('parents'));
  }

  return this.rebaseFinish(toRebaseRough, stopSet, targetSource, currentLocation);
};

GitEngine.prototype.rebaseInteractive = function(targetSource, currentLocation) {
  // there are a reduced set of checks now, so we can't exactly use parts of the rebase function
  // but it will look similar.

  // first if we are upstream of the target
  if (this.isUpstreamOf(currentLocation, targetSource)) {
    throw new GitError({
      msg: 'Nothing to do... (git throws a "noop" status here); ' +
        'Your source is upstream of your rebase target'
    });
  }

  // now get the stop set
  var stopSet = this.getUpstreamSet(targetSource);

  var toRebaseRough = [];
  // standard BFS
  var pQueue = [this.getCommitFromRef(currentLocation)];

  while (pQueue.length) {
    var popped = pQueue.pop();

    if (stopSet[popped.get('id')]) {
      continue;
    }

    toRebaseRough.push(popped);
    pQueue = pQueue.concat(popped.get('parents'));
    pQueue.sort(this.dateSortFunc);
  }

  // throw out merge's real fast and see if we have anything to do
  var toRebase = [];
  _.each(toRebaseRough, function(commit) {
    if (commit.get('parents').length == 1) {
      toRebase.push(commit);
    }
  });

  if (!toRebase.length) {
    throw new GitError({
      msg: 'No commits to rebase! Everything is a merge commit'
    });
  }

  // now do stuff :D since all our validation checks have passed, we are going to defer animation
  // and actually launch the dialog
  this.animationQueue.set('defer', true);

  var deferred = Q.defer();
  deferred.promise
  .then(_.bind(function(userSpecifiedRebase) {
    // first, they might have dropped everything (annoying)
    if (!userSpecifiedRebase.length) {
      throw new CommandResult({
        msg: 'Nothing to do...'
      });
    }

    // finish the rebase crap and animate!
    var animationData = this.rebaseFinish(userSpecifiedRebase, {}, targetSource, currentLocation);
    this.animationFactory.rebaseAnimation(this.animationQueue, animationData, this, this.gitVisuals);
    this.animationQueue.start();
  }, this))
  .fail(_.bind(function(err) {
    this.filterError(err);
    this.command.set('error', err);
    this.animationQueue.start();
  }, this))
  .done();

  var InteractiveRebaseView = require('../views/rebaseView').InteractiveRebaseView;
  // interactive rebase view will reject or resolve our promise
  new InteractiveRebaseView({
    deferred: deferred,
    toRebase: toRebase
  });
};

GitEngine.prototype.rebaseFinish = function(toRebaseRough, stopSet, targetSource, currentLocation) {
  // now we have the all the commits between currentLocation and the set of target to rebase.
  var animationResponse = {};
  animationResponse.destinationBranch = this.resolveID(targetSource);

  // we need to throw out merge commits
  var toRebase = [];
  _.each(toRebaseRough, function(commit) {
    if (commit.get('parents').length == 1) {
      toRebase.push(commit);
    }
  });

  // we ALSO need to throw out commits that will do the same changes. like
  // if the upstream set has a commit C4 and we have C4', we dont rebase the C4' again.
  // get this by doing ID scraping
  var changesAlreadyMade = {};
  _.each(stopSet, function(val, key) {
    changesAlreadyMade[this.scrapeBaseID(key)] = val; // val == true
  }, this);

  // now get rid of the commits that will redo same changes
  toRebaseRough = toRebase;
  toRebase = [];
  _.each(toRebaseRough, function(commit) {
    var baseID = this.scrapeBaseID(commit.get('id'));
    if (!changesAlreadyMade[baseID]) {
      toRebase.push(commit);
    }
  }, this);

  toRebaseRough = toRebase;
  toRebase = [];
  // finally, make the set unique
  var uniqueIDs = {};
  _.each(toRebaseRough, function(commit) {
    if (uniqueIDs[commit.get('id')]) { return; }

    uniqueIDs[commit.get('id')] = true;
    toRebase.push(commit);
  }, this);

  if (!toRebase.length) {
    throw new GitError({
      msg: 'No Commits to Rebase! Everything else is merge commits or changes already have been applied'
    });
  }

  animationResponse.toRebaseArray = toRebase.slice(0);

  // now pop all of these commits onto targetLocation
  var base = this.getCommitFromRef(targetSource);

  // do the rebase, and also maintain all our animation info during this
  animationResponse.rebaseSteps = [];
  var beforeSnapshot = this.gitVisuals.genSnapshot();
  var afterSnapshot;
  _.each(toRebase, function(old) {
    var newId = this.rebaseAltID(old.get('id'));

    var newCommit = this.makeCommit([base], newId);
    base = newCommit;

    // animation info
    afterSnapshot = this.gitVisuals.genSnapshot();
    animationResponse.rebaseSteps.push({
      oldCommit: old,
      newCommit: newCommit,
      beforeSnapshot: beforeSnapshot,
      afterSnapshot: afterSnapshot
    });
    beforeSnapshot = afterSnapshot;
  }, this);

  if (this.resolveID(currentLocation).get('type') == 'commit') {
    // we referenced a commit like git rebase C2 C1, so we have
    // to manually check out C1'

    var steps = animationResponse.rebaseSteps;
    var newestCommit = steps[steps.length - 1].newCommit;

    this.checkout(newestCommit);
  } else {
    // now we just need to update the rebased branch is
    this.setTargetLocation(currentLocation, base);
    this.checkout(currentLocation);
  }

  // for animation
  return animationResponse;
};

GitEngine.prototype.mergeStarter = function() {
  this.twoArgsImpliedHead(this.generalArgs);

  var newCommit = this.merge(this.generalArgs[0], this.generalArgs[1]);

  if (newCommit === undefined) {
    // its just a fast forwrard
    this.animationFactory.refreshTree(this.animationQueue, this.gitVisuals);
    return;
  }

  this.animationFactory.genCommitBirthAnimation(this.animationQueue, newCommit, this.gitVisuals);
};

GitEngine.prototype.merge = function(targetSource, currentLocation) {
  // first some conditions
  if (this.isUpstreamOf(targetSource, currentLocation) ||
      this.getCommitFromRef(targetSource) === this.getCommitFromRef(currentLocation)) {
    throw new CommandResult({
      msg: 'Branch already up-to-date'
    });
  }

  if (this.isUpstreamOf(currentLocation, targetSource)) {
    // just set the target of this current location to the source
    this.setTargetLocation(currentLocation, this.getCommitFromRef(targetSource));
    // get fresh animation to happen
    this.command.setResult('Fast-forwarding...');
    return;
  }

  // now the part of making a merge commit
  var parent1 = this.getCommitFromRef(currentLocation);
  var parent2 = this.getCommitFromRef(targetSource);

  // we need a fancy commit message
  var msg = 'Merge ' + this.resolveName(targetSource) +
    ' into ' + this.resolveName(currentLocation);

  // since we specify parent 1 as the first parent, it is the "main" parent
  // and the node will be displayed below that branch / commit / whatever
  var mergeCommit = this.makeCommit(
    [parent1, parent2],
    null,
    {
      commitMessage: msg
    }
  );

  this.setTargetLocation(currentLocation, mergeCommit);
  return mergeCommit;
};

GitEngine.prototype.checkoutStarter = function() {
  var args = null;
  if (this.commandOptions['-b']) {
    if (this.generalArgs.length) {
      throw new GitError({
        msg: "I don't expect general args before -b!"
      });
    }

    // the user is really trying to just make a branch and then switch to it. so first:
    args = this.commandOptions['-b'];
    this.twoArgsImpliedHead(args, '-b');

    var validId = this.validateBranchName(args[0]);
    this.branch(validId, args[1]);
    this.checkout(validId);
    return;
  }

  if (this.commandOptions['-']) {
    // get the heads last location
    var lastPlace = this.HEAD.get('lastLastTarget');
    if (!lastPlace) {
      throw new GitError({
        msg: 'Need a previous location to do - switching'
      });
    }
    this.HEAD.set('target', lastPlace);
    return;
  }

  if (this.commandOptions['-B']) {
    args = this.commandOptions['-B'];
    this.twoArgsImpliedHead(args, '-B');

    this.forceBranch(args[0], args[1]);
    this.checkout(args[0]);
    return;
  }

  this.validateArgBounds(this.generalArgs, 1, 1);

  this.checkout(this.unescapeQuotes(this.generalArgs[0]));
};

GitEngine.prototype.checkout = function(idOrTarget) {
  var target = this.resolveID(idOrTarget);
  if (target.get('id') === 'HEAD') {
    // git checkout HEAD is a
    // meaningless command but i used to do this back in the day
    return;
  }

  var type = target.get('type');
  if (type !== 'branch' && type !== 'commit') {
    throw new GitError({
      msg: 'can only checkout branches and commits!'
    });
  }

  this.HEAD.set('target', target);
};

GitEngine.prototype.branchStarter = function() {
  var args = null;
  // handle deletion first
  if (this.commandOptions['-d'] || this.commandOptions['-D']) {
    var names = this.commandOptions['-d'] || this.commandOptions['-D'];
    this.validateArgBounds(names, 1, NaN, '-d');

    _.each(names, function(name) {
      this.deleteBranch(name);
    }, this);
    return;
  }

  if (this.commandOptions['--contains']) {
    args = this.commandOptions['--contains'];
    this.validateArgBounds(args, 1, 1, '--contains');
    this.printBranchesWithout(args[0]);
    return;
  }

  if (this.commandOptions['-f']) {
    args = this.commandOptions['-f'];
    this.twoArgsImpliedHead(args, '-f');

    // we want to force a branch somewhere
    this.forceBranch(args[0], args[1]);
    return;
  }


  if (this.generalArgs.length === 0) {
    this.printBranches(this.getBranches());
    return;
  }

  this.twoArgsImpliedHead(this.generalArgs);
  this.branch(this.generalArgs[0], this.generalArgs[1]);
};

GitEngine.prototype.forceBranch = function(branchName, where) {
  // if branchname doesn't exist...
  if (!this.refs[branchName]) {
    this.branch(branchName, where);
  }

  var branch = this.resolveID(branchName);
  if (branch.get('type') !== 'branch') {
    throw new GitError({
      msg: "Can't force move anything but a branch!!"
    });
  }

  var whereCommit = this.getCommitFromRef(where);

  this.setTargetLocation(branch, whereCommit);
};

GitEngine.prototype.branch = function(name, ref) {
  var target = this.getCommitFromRef(ref);
  this.makeBranch(name, target);
};

GitEngine.prototype.deleteBranch = function(name) {
  // trying to delete, lets check our refs
  var target = this.resolveID(name);
  if (target.get('type') !== 'branch') {
    throw new GitError({
      msg: "You can't delete things that arent branches with branch command"
    });
  }
  if (target.get('id') == 'master') {
    throw new GitError({
      msg: "You can't delete the master branch!"
    });
  }
  if (this.HEAD.get('target') === target) {
    throw new GitError({
      msg: "Cannot delete the branch you are currently on"
    });
  }

  // now we know it's a branch
  var branch = target;

  this.branchCollection.remove(branch);
  this.refs[branch.get('id')] = undefined;
  delete this.refs[branch.get('id')];

  if (branch.get('visBranch')) {
    branch.get('visBranch').remove();
  }
};

GitEngine.prototype.unescapeQuotes = function(str) {
  return str.replace(/&#x27;/g, "'");
};

GitEngine.prototype.filterError = function(err) {
 if (!(err instanceof GitError ||
      err instanceof CommandResult)) {
    throw err;
  }
};

GitEngine.prototype.dispatch = function(command, deferred) {
  // current command, options, and args are stored in the gitEngine
  // for easy reference during processing.
  this.command = command;
  this.commandOptions = command.get('supportedMap');
  this.generalArgs = command.get('generalArgs');

  // set up the animation queue
  var whenDone = _.bind(function() {
    command.finishWith(deferred);
  }, this);
  this.animationQueue = new AnimationQueue({
    callback: whenDone
  });

  try {
    var methodName = command.get('method').replace(/-/g, '') + 'Starter';
    this[methodName]();
  } catch (err) {
    this.filterError(err);
    // short circuit animation by just setting error and returning
    command.set('error', err);
    deferred.resolve();
    return;
  }

  // only add the refresh if we didn't do manual animations
  if (!this.animationQueue.get('animations').length && !this.animationQueue.get('defer')) {
    this.animationFactory.refreshTree(this.animationQueue, this.gitVisuals);
  }

  // animation queue will call the callback when its done
  if (!this.animationQueue.get('defer')) {
    this.animationQueue.start();
  }
};

GitEngine.prototype.showStarter = function() {
  this.oneArgImpliedHead(this.generalArgs);

  this.show(this.generalArgs[0]);
};

GitEngine.prototype.show = function(ref) {
  var commit = this.getCommitFromRef(ref);

  throw new CommandResult({
    msg: commit.getShowEntry()
  });
};

GitEngine.prototype.statusStarter = function() {
  var lines = [];
  if (this.getDetachedHead()) {
    lines.push('Detached Head!');
  } else {
    var branchName = this.HEAD.get('target').get('id');
    lines.push('On branch ' + branchName);
  }
  lines.push('Changes to be committed:');
  lines.push('');
  lines.push('&nbsp;&nbsp;&nbsp; modified: cal/OskiCostume.stl');
  lines.push('');
  lines.push('Ready to commit! (as always in this demo)');

  var msg = '';
  _.each(lines, function(line) {
    msg += '# ' + line + '\n';
  });

  throw new CommandResult({
    msg: msg
  });
};

GitEngine.prototype.logStarter = function() {
  if (this.generalArgs.length == 2) {
    // do fancy git log branchA ^branchB
    if (this.generalArgs[1][0] == '^') {
      this.logWithout(this.generalArgs[0], this.generalArgs[1]);
    } else {
      throw new GitError({
        msg: 'I need a not branch (^branchName) when getting two arguments!'
      });
    }
  }

  this.oneArgImpliedHead(this.generalArgs);
  this.log(this.generalArgs[0]);
};

GitEngine.prototype.logWithout = function(ref, omitBranch) {
  // slice off the ^branch
  omitBranch = omitBranch.slice(1);
  this.log(ref, this.getUpstreamSet(omitBranch));
};

GitEngine.prototype.log = function(ref, omitSet) {
  // omit set is for doing stuff like git log branchA ^branchB
  omitSet = omitSet || {};
  // first get the commit we referenced
  var commit = this.getCommitFromRef(ref);

  // then get as many far back as we can from here, order by commit date
  var toDump = [];
  var pQueue = [commit];

  var seen = {};

  while (pQueue.length) {
    var popped = pQueue.shift(0);
    if (seen[popped.get('id')] || omitSet[popped.get('id')]) {
      continue;
    }
    seen[popped.get('id')] = true;

    toDump.push(popped);

    if (popped.get('parents') && popped.get('parents').length) {
      pQueue = pQueue.concat(popped.get('parents'));
    }
  }

  // now go through and collect logs
  var bigLogStr = '';
  _.each(toDump, function(c) {
    bigLogStr += c.getLogEntry();
  }, this);

  throw new CommandResult({
    msg: bigLogStr
  });
};

GitEngine.prototype.addStarter = function() {
  throw new CommandResult({
    msg: "This demo is meant to demonstrate git branching, so don't worry about " +
         "adding / staging files. Just go ahead and commit away!"
  });
};

GitEngine.prototype.getCommonAncestor = function(ancestor, cousin) {
  if (this.isUpstreamOf(cousin, ancestor)) {
    throw new Error('Dont use common ancestor if we are upstream!');
  }

  var upstreamSet = this.getUpstreamSet(ancestor);
  // now BFS off of cousin until you find something

  var queue = [this.getCommitFromRef(cousin)];
  while (queue.length) {
    var here = queue.pop();
    if (upstreamSet[here.get('id')]) {
      return here;
    }
    queue = queue.concat(here.get('parents'));
  }
  throw new Error('something has gone very wrong... two nodes arent connected!');
};

GitEngine.prototype.isUpstreamOf = function(child, ancestor) {
  child = this.getCommitFromRef(child);

  // basically just do a completely BFS search on ancestor to the root, then
  // check for membership of child in that set of explored nodes
  var upstream = this.getUpstreamSet(ancestor);
  return upstream[child.get('id')] !== undefined;
};

GitEngine.prototype.getUpstreamSet = function(ancestor) {
  var commit = this.getCommitFromRef(ancestor);
  var ancestorID = commit.get('id');
  var queue = [commit];

  var exploredSet = {};
  exploredSet[ancestorID] = true;

  var addToExplored = function(rent) {
    exploredSet[rent.get('id')] = true;
    queue.push(rent);
  };

  while (queue.length) {
    var here = queue.pop();
    var rents = here.get('parents');

    _.each(rents, addToExplored);
  }
  return exploredSet;
};


var Ref = Backbone.Model.extend({
  initialize: function() {
    if (!this.get('target')) {
      throw new Error('must be initialized with target');
    }
    if (!this.get('id')) {
      throw new Error('must be given an id');
    }
    this.set('type', 'general ref');

    if (this.get('id') == 'HEAD') {
      this.set('lastLastTarget', null);
      this.set('lastTarget', this.get('target'));
      // have HEAD remember where it is for checkout -
      this.on('change:target', this.targetChanged, this);
    }
  },

  targetChanged: function(model, targetValue, ev) {
    // push our little 3 stack back. we need to do this because
    // backbone doesn't give you what the value WAS, only what it was changed
    // TO
    this.set('lastLastTarget', this.get('lastTarget'));
    this.set('lastTarget', targetValue);
  },

  toString: function() {
    return 'a ' + this.get('type') + 'pointing to ' + String(this.get('target'));
  }
});

var Branch = Ref.extend({
  defaults: {
    visBranch: null
  },

  initialize: function() {
    Ref.prototype.initialize.call(this);
    this.set('type', 'branch');
  }
});

var Commit = Backbone.Model.extend({
  defaults: {
    type: 'commit',
    children: null,
    parents: null,
    author: 'Peter Cottle',
    createTime: null,
    commitMessage: null,
    visNode: null,
    gitVisuals: null
  },

  constants: {
    circularFields: ['gitVisuals', 'visNode', 'children']
  },

  getLogEntry: function() {
    // for now we are just joining all these things with newlines which
    // will get placed by paragraph tags. Not really a fan of this, but
    // it's better than making an entire template and all that jazz
    return [
      'Author: ' + this.get('author'),
      'Date: ' + this.get('createTime'),
      '<br/>',
      this.get('commitMessage'),
      '<br/>',
      'Commit: ' + this.get('id')
    ].join('\n' ) + '\n';
  },

  getShowEntry: function() {
    // same deal as above, show log entry and some fake changes
    return [
      this.getLogEntry(),
      'diff --git a/bigGameResults.html b/bigGameResults.html',
      '--- bigGameResults.html',
      '+++ bigGameResults.html',
      '@@ 13,27 @@ Winner, Score',
      '- Stanfurd, 14-7',
      '+ Cal, 21-14'
    ].join('\n') + '\n';
  },

  validateAtInit: function() {
    if (!this.get('id')) {
      throw new Error('Need ID!!');
    }

    if (!this.get('createTime')) {
      this.set('createTime', new Date().toString());
    }
    if (!this.get('commitMessage')) {
      this.set('commitMessage', 'Quick Commit. Go Bears!');
    }

    this.set('children', []);

    // root commits have no parents
    if (!this.get('rootCommit')) {
      if (!this.get('parents') || !this.get('parents').length) {
        throw new Error('needs parents');
      }
    }
  },

  addNodeToVisuals: function() {
    var visNode = this.get('gitVisuals').addNode(this.get('id'), this);
    this.set('visNode', visNode);
  },

  addEdgeToVisuals: function(parent) {
    this.get('gitVisuals').addEdge(this.get('id'), parent.get('id'));
  },

  isMainParent: function(parent) {
    var index = this.get('parents').indexOf(parent);
    return index === 0;
  },

  initialize: function(options) {
    this.validateAtInit();
    this.addNodeToVisuals();

    _.each(this.get('parents'), function(parent) {
      parent.get('children').push(this);
      this.addEdgeToVisuals(parent);
    }, this);
  }
});

exports.GitEngine = GitEngine;
exports.Commit = Commit;
exports.Branch = Branch;
exports.Ref = Ref;


});

require.define("/src/js/visuals/animation/animationFactory.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var Animation = require('./index').Animation;
var GRAPHICS = require('../../util/constants').GRAPHICS;

/******************
 * This class is responsible for a lot of the heavy lifting around creating an animation at a certain state in time.
 * The tricky thing is that when a new commit has to be "born," say in the middle of a rebase
 * or something, it must animate out from the parent position to it's birth position.

 * These two positions though may not be where the commit finally ends up. So we actually need to take a snapshot of the tree,
 * store all those positions, take a snapshot of the tree after a layout refresh afterwards, and then animate between those two spots.
 * and then essentially animate the entire tree too.
 */

// essentially a static class
var AnimationFactory = function() {

};

AnimationFactory.prototype.genCommitBirthAnimation = function(animationQueue, commit, gitVisuals) {
  if (!animationQueue) {
    throw new Error("Need animation queue to add closure to!");
  }

  var time = GRAPHICS.defaultAnimationTime * 1.0;
  var bounceTime = time * 2;

  // essentially refresh the entire tree, but do a special thing for the commit
  var visNode = commit.get('visNode');

  var animation = function() {
    // this takes care of refs and all that jazz, and updates all the positions
    gitVisuals.refreshTree(time);

    visNode.setBirth();
    visNode.parentInFront();
    gitVisuals.visBranchesFront();

    visNode.animateUpdatedPosition(bounceTime, 'bounce');
    visNode.animateOutgoingEdges(time);
  };

  animationQueue.add(new Animation({
    closure: animation,
    duration: Math.max(time, bounceTime)
  }));
};

AnimationFactory.prototype.overrideOpacityDepth2 = function(attr, opacity) {
  opacity = (opacity === undefined) ? 1 : opacity;

  var newAttr = {};

  _.each(attr, function(partObj, partName) {
    newAttr[partName] = {};
    _.each(partObj, function(val, key) {
      if (key == 'opacity') {
        newAttr[partName][key] = opacity;
      } else {
        newAttr[partName][key] = val;
      }
    });
  });
  return newAttr;
};

AnimationFactory.prototype.overrideOpacityDepth3 = function(snapShot, opacity) {
  var newSnap = {};

  _.each(snapShot, function(visObj, visID) {
    newSnap[visID] = this.overrideOpacityDepth2(visObj, opacity);
  }, this);
  return newSnap;
};

AnimationFactory.prototype.genCommitBirthClosureFromSnapshot = function(step, gitVisuals) {
  var time = GRAPHICS.defaultAnimationTime * 1.0;
  var bounceTime = time * 1.5;

  var visNode = step.newCommit.get('visNode');
  var afterAttrWithOpacity = this.overrideOpacityDepth2(step.afterSnapshot[visNode.getID()]);
  var afterSnapWithOpacity = this.overrideOpacityDepth3(step.afterSnapshot);

  var animation = function() {
    visNode.setBirthFromSnapshot(step.beforeSnapshot);
    visNode.parentInFront();
    gitVisuals.visBranchesFront();

    visNode.animateToAttr(afterAttrWithOpacity, bounceTime, 'bounce');
    visNode.animateOutgoingEdgesToAttr(afterSnapWithOpacity, bounceTime);
  };

  return animation;
};

AnimationFactory.prototype.refreshTree = function(animationQueue, gitVisuals) {
  animationQueue.add(new Animation({
    closure: function() {
      gitVisuals.refreshTree();
    }
  }));
};

AnimationFactory.prototype.rebaseAnimation = function(animationQueue, rebaseResponse,
                                                      gitEngine, gitVisuals) {

  this.rebaseHighlightPart(animationQueue, rebaseResponse, gitEngine);
  this.rebaseBirthPart(animationQueue, rebaseResponse, gitEngine, gitVisuals);
};

AnimationFactory.prototype.rebaseHighlightPart = function(animationQueue, rebaseResponse, gitEngine) {
  var fullTime = GRAPHICS.defaultAnimationTime * 0.66;
  var slowTime = fullTime * 2.0;

  // we want to highlight all the old commits
  var oldCommits = rebaseResponse.toRebaseArray;
  // we are either highlighting to a visBranch or a visNode
  var visBranch = rebaseResponse.destinationBranch.get('visBranch');
  if (!visBranch) {
    // in the case where we rebase onto a commit
    visBranch = rebaseResponse.destinationBranch.get('visNode');
  }

  _.each(oldCommits, function(oldCommit) {
    var visNode = oldCommit.get('visNode');
    animationQueue.add(new Animation({
      closure: function() {
        visNode.highlightTo(visBranch, slowTime, 'easeInOut');
      },
      duration: fullTime * 1.5
    }));

  }, this);

  this.delay(animationQueue, fullTime * 2);
};

AnimationFactory.prototype.rebaseBirthPart = function(animationQueue, rebaseResponse,
                                                      gitEngine, gitVisuals) {
  var rebaseSteps = rebaseResponse.rebaseSteps;

  var newVisNodes = [];
  _.each(rebaseSteps, function(step) {
    var visNode = step.newCommit.get('visNode');

    newVisNodes.push(visNode);
    visNode.setOpacity(0);
    visNode.setOutgoingEdgesOpacity(0);
  }, this);

  var previousVisNodes = [];
  _.each(rebaseSteps, function(rebaseStep, index) {
    var toOmit = newVisNodes.slice(index + 1);

    var snapshotPart = this.genFromToSnapshotAnimation(
      rebaseStep.beforeSnapshot,
      rebaseStep.afterSnapshot,
      toOmit,
      previousVisNodes,
      gitVisuals
    );
    var birthPart = this.genCommitBirthClosureFromSnapshot(rebaseStep, gitVisuals);

    var animation = function() {
      snapshotPart();
      birthPart();
    };

    animationQueue.add(new Animation({
      closure: animation,
      duration: GRAPHICS.defaultAnimationTime * 1.5
    }));

    previousVisNodes.push(rebaseStep.newCommit.get('visNode'));
  }, this);

  // need to delay to let bouncing finish
  this.delay(animationQueue);

  this.refreshTree(animationQueue, gitVisuals);
};

AnimationFactory.prototype.delay = function(animationQueue, time) {
  time = time || GRAPHICS.defaultAnimationTime;
  animationQueue.add(new Animation({
    closure: function() { },
    duration: time
  }));
};

AnimationFactory.prototype.genSetAllCommitOpacities = function(visNodes, opacity) {
  // need to slice for closure
  var nodesToAnimate = visNodes.slice(0);

  return function() {
    _.each(nodesToAnimate, function(visNode) {
      visNode.setOpacity(opacity);
      visNode.setOutgoingEdgesOpacity(opacity);
    });
  };
};

AnimationFactory.prototype.stripObjectsFromSnapshot = function(snapShot, toOmit) {
  var ids = [];
  _.each(toOmit, function(obj) {
    ids.push(obj.getID());
  });

  var newSnapshot = {};
  _.each(snapShot, function(val, key) {
    if (_.include(ids, key)) {
      // omit
      return;
    }
    newSnapshot[key] = val;
  }, this);
  return newSnapshot;
};

AnimationFactory.prototype.genFromToSnapshotAnimation = function(
  beforeSnapshot,
  afterSnapshot,
  commitsToOmit,
  commitsToFixOpacity,
  gitVisuals) {

  // we want to omit the commit outgoing edges
  var toOmit = [];
  _.each(commitsToOmit, function(visNode) {
    toOmit.push(visNode);
    toOmit = toOmit.concat(visNode.get('outgoingEdges'));
  });

  var fixOpacity = function(obj) {
    if (!obj) { return; }
    _.each(obj, function(attr, partName) {
      obj[partName].opacity = 1;
    });
  };

  // HORRIBLE loop to fix opacities all throughout the snapshot
  _.each([beforeSnapshot, afterSnapshot], function(snapShot) {
    _.each(commitsToFixOpacity, function(visNode) {
      fixOpacity(snapShot[visNode.getID()]);
      _.each(visNode.get('outgoingEdges'), function(visEdge) {
        fixOpacity(snapShot[visEdge.getID()]);
      });
    });
  });

  return function() {
    gitVisuals.animateAllFromAttrToAttr(beforeSnapshot, afterSnapshot, toOmit);
  };
};

exports.AnimationFactory = AnimationFactory;


});

require.define("/src/js/visuals/animation/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GLOBAL = require('../../util/constants').GLOBAL;

var Animation = Backbone.Model.extend({
  defaults: {
    duration: 300,
    closure: null
  },

  validateAtInit: function() {
    if (!this.get('closure')) {
      throw new Error('give me a closure!');
    }
  },

  initialize: function(options) {
    this.validateAtInit();
  },

  run: function() {
    this.get('closure')();
  }
});

var AnimationQueue = Backbone.Model.extend({
  defaults: {
    animations: null,
    index: 0,
    callback: null,
    defer: false
  },

  initialize: function(options) {
    this.set('animations', []);
    if (!options.callback) {
      console.warn('no callback');
    }
  },

  add: function(animation) {
    if (!animation instanceof Animation) {
      throw new Error("Need animation not something else");
    }

    this.get('animations').push(animation);
  },

  start: function() {
    this.set('index', 0);

    // set the global lock that we are animating
    GLOBAL.isAnimating = true;
    this.next();
  },

  finish: function() {
    // release lock here
    GLOBAL.isAnimating = false;
    this.get('callback')();
  },

  next: function() {
    // ok so call the first animation, and then set a timeout to call the next.
    // since an animation is defined as taking a specific amount of time,
    // we can simply just use timeouts rather than promises / deferreds.
    // for graphical displays that require an unknown amount of time, use deferreds
    // but not animation queue (see the finishAnimation for that)
    var animations = this.get('animations');
    var index = this.get('index');
    if (index >= animations.length) {
      this.finish();
      return;
    }

    var next = animations[index];
    var duration = next.get('duration');

    next.run();

    this.set('index', index + 1);
    setTimeout(_.bind(function() {
      this.next();
    }, this), duration);
  }
});

exports.Animation = Animation;
exports.AnimationQueue = AnimationQueue;

});

require.define("/src/js/git/treeCompare.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

// static class...
function TreeCompare() {

}

TreeCompare.prototype.compareAllBranchesWithinTreesAndHEAD = function(treeA, treeB) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);

  return treeA.HEAD.target == treeB.HEAD.target && this.compareAllBranchesWithinTrees(treeA, treeB);
};

TreeCompare.prototype.compareAllBranchesWithinTrees = function(treeA, treeB) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);

  var allBranches = _.extend(
    {},
    treeA.branches,
    treeB.branches
  );

  var result = true;
  _.uniq(allBranches, function(info, branch) {
    result = result && this.compareBranchWithinTrees(treeA, treeB, branch);
  }, this);
  return result;
};

TreeCompare.prototype.compareBranchesWithinTrees = function(treeA, treeB, branches) {
  var result = true;
  _.each(branches, function(branchName) {
    result = result && this.compareBranchWithinTrees(treeA, treeB, branchName);
  }, this);

  return result;
};

TreeCompare.prototype.getRecurseCompare = function(treeA, treeB) {
  // we need a recursive comparison function to bubble up the  branch
  var recurseCompare = function(commitA, commitB) {
    // this is the short-circuit base case
    var result = _.isEqual(commitA, commitB);
    if (!result) {
      return false;
    }

    // we loop through each parent ID. we sort the parent ID's beforehand
    // so the index lookup is valid
    _.each(commitA.parents, function(pAid, index) {
      var pBid = commitB.parents[index];

      var childA = treeA.commits[pAid];
      var childB = treeB.commits[pBid];

      result = result && recurseCompare(childA, childB);
    }, this);
    // if each of our children recursively are equal, we are good
    return result;
  };
  return recurseCompare;
};

TreeCompare.prototype.compareBranchWithinTrees = function(treeA, treeB, branchName) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);
  this.reduceTreeFields([treeA, treeB]);

  var recurseCompare = this.getRecurseCompare(treeA, treeB);
  var branchA = treeA.branches[branchName];
  var branchB = treeB.branches[branchName];

  return _.isEqual(branchA, branchB) &&
    recurseCompare(treeA.commits[branchA.target], treeB.commits[branchB.target]);
};

TreeCompare.prototype.convertTreeSafe = function(tree) {
  if (typeof tree == 'string') {
    return JSON.parse(unescape(tree));
  }
  return tree;
};

TreeCompare.prototype.reduceTreeFields = function(trees) {
  var commitSaveFields = [
    'parents',
    'id',
    'rootCommit'
  ];
  var commitSortFields = ['children', 'parents'];
  var branchSaveFields = [
    'target',
    'id'
  ];

  // this function saves only the specified fields of a tree
  var saveOnly = function(tree, treeKey, saveFields, sortFields) {
    var objects = tree[treeKey];
    _.each(objects, function(obj, objKey) {
      // our blank slate to copy over
      var blank = {};
      _.each(saveFields, function(field) {
        if (obj[field] !== undefined) {
          blank[field] = obj[field];
        }
      });

      _.each(sortFields, function(field) {
        // also sort some fields
        if (obj[field]) {
          obj[field].sort();
          blank[field] = obj[field];
        }
      });
      tree[treeKey][objKey] = blank;
    });
  };

  _.each(trees, function(tree) {
    saveOnly(tree, 'commits', commitSaveFields, commitSortFields);
    saveOnly(tree, 'branches', branchSaveFields);

    tree.HEAD = {
      target: tree.HEAD.target,
      id: tree.HEAD.id
    };
  });
};

TreeCompare.prototype.compareTrees = function(treeA, treeB) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);

  // now we need to strip out the fields we don't care about, aka things
  // like createTime, message, author
  this.reduceTreeFields([treeA, treeB]);

  return _.isEqual(treeA, treeB);
};

exports.TreeCompare = TreeCompare;


});

require.define("/src/js/views/rebaseView.js",function(require,module,exports,__dirname,__filename,process,global){var GitError = require('../util/errors').GitError;
var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;
var ConfirmCancelView = require('../views').ConfirmCancelView;
var LeftRightView = require('../views').LeftRightView;

var InteractiveRebaseView = ContainedBase.extend({
  tagName: 'div',
  template: _.template($('#interactive-rebase-template').html()),

  initialize: function(options) {
    this.deferred = options.deferred;
    this.rebaseMap = {};
    this.entryObjMap = {};

    this.rebaseEntries = new RebaseEntryCollection();
    options.toRebase.reverse();
    _.each(options.toRebase, function(commit) {
      var id = commit.get('id');
      this.rebaseMap[id] = commit;

      // make basic models for each commit
      this.entryObjMap[id] = new RebaseEntry({
        id: id
      });
      this.rebaseEntries.add(this.entryObjMap[id]);
    }, this);

    this.container = new ModalTerminal({
      title: 'Interactive Rebase'
    });
    this.render();

    // show the dialog holder
    this.show();
  },

  confirm: function() {
    this.die();

    // get our ordering
    var uiOrder = [];
    this.$('ul.rebaseEntries li').each(function(i, obj) {
      uiOrder.push(obj.id);
    });

    // now get the real array
    var toRebase = [];
    _.each(uiOrder, function(id) {
      // the model pick check
      if (this.entryObjMap[id].get('pick')) {
        toRebase.unshift(this.rebaseMap[id]);
      }
    }, this);
    toRebase.reverse();

    this.deferred.resolve(toRebase);
    // garbage collection will get us
    this.$el.html('');
  },

  render: function() {
    var json = {
      num: _.keys(this.rebaseMap).length
    };

    var destination = this.container.getInsideElement();
    this.$el.html(this.template(json));
    $(destination).append(this.el);

    // also render each entry
    var listHolder = this.$('ul.rebaseEntries');
    this.rebaseEntries.each(function(entry) {
      new RebaseEntryView({
        el: listHolder,
        model: entry
      });
    }, this);

    // then make it reorderable..
    listHolder.sortable({
      axis: 'y',
      placeholder: 'rebaseEntry transitionOpacity ui-state-highlight',
      appendTo: 'parent'
    });

    this.makeButtons();
  },

  makeButtons: function() {
    // control for button
    var deferred = Q.defer();
    deferred.promise
    .then(_.bind(function() {
      this.confirm();
    }, this))
    .fail(_.bind(function() {
      // empty array does nothing, just like in git
      this.hide();
      this.deferred.resolve([]);
    }, this))
    .done();

    // finally get our buttons
    new ConfirmCancelView({
      destination: this.$('.confirmCancel'),
      deferred: deferred
    });
  }
});

var RebaseEntry = Backbone.Model.extend({
  defaults: {
    pick: true
  },

  toggle: function() {
    this.set('pick', !this.get('pick'));
  }
});

var RebaseEntryCollection = Backbone.Collection.extend({
  model: RebaseEntry
});

var RebaseEntryView = Backbone.View.extend({
  tagName: 'li',
  template: _.template($('#interactive-rebase-entry-template').html()),

  toggle: function() {
    this.model.toggle();

    // toggle a class also
    this.listEntry.toggleClass('notPicked', !this.model.get('pick'));
  },

  initialize: function(options) {
    this.render();
  },

  render: function() {
    var json = this.model.toJSON();
    this.$el.append(this.template(this.model.toJSON()));

    // hacky :( who would have known jquery barfs on ids with %'s and quotes
    this.listEntry = this.$el.children(':last');

    this.listEntry.delegate('#toggleButton', 'click', _.bind(function() {
      this.toggle();
    }, this));
  }
});

exports.InteractiveRebaseView = InteractiveRebaseView;

});

require.define("/src/js/views/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var Main = require('../app');
var Constants = require('../util/constants');
var KeyboardListener = require('../util/keyboard').KeyboardListener;
var GitError = require('../util/errors').GitError;

var BaseView = Backbone.View.extend({
  getDestination: function() {
    return this.destination || this.container.getInsideElement();
  },

  tearDown: function() {
    this.$el.remove();
    if (this.container) {
      this.container.tearDown();
    }
  },

  renderAgain: function(HTML) {
    // flexibility
    HTML = HTML || this.template(this.JSON);
    this.$el.html(HTML);
  },

  render: function(HTML) {
    this.renderAgain(HTML);
    var destination = this.getDestination();
    $(destination).append(this.el);
  }
});

var ResolveRejectBase = BaseView.extend({
  resolve: function() {
    this.deferred.resolve();
  },

  reject: function() {
    this.deferred.reject();
  }
});

var PositiveNegativeBase = BaseView.extend({
  positive: function() {
    this.navEvents.trigger('positive');
  },

  negative: function() {
    this.navEvents.trigger('negative');
  }
});

var ContainedBase = BaseView.extend({
  getAnimationTime: function() { return 700; },

  show: function() {
    this.container.show();
  },

  hide: function() {
    this.container.hide();
  },

  die: function() {
    this.hide();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this), this.getAnimationTime() * 1.1);
  }
});

var GeneralButton = ContainedBase.extend({
  tagName: 'a',
  className: 'generalButton uiButton',
  template: _.template($('#general-button').html()),
  events: {
    'click': 'click'
  },

  initialize: function(options) {
    options = options || {};
    this.navEvents = options.navEvents || _.clone(Backbone.Events);
    this.destination = options.destination;
    if (!this.destination) {
      this.container = new ModalTerminal();
    }

    this.JSON = {
      buttonText: options.buttonText || 'General Button',
      wantsWrapper: (options.wantsWrapper !== undefined) ? options.wantsWrapper : true
    };

    this.render();

    if (this.container && !options.wait) {
      this.show();
    }
  },

  click: function() {
    if (!this.clickFunc) {
      this.clickFunc = _.throttle(
        _.bind(this.sendClick, this),
        500
      );
    }
    this.clickFunc();
  },

  sendClick: function() {
    this.navEvents.trigger('click');
  }
});

var ConfirmCancelView = ResolveRejectBase.extend({
  tagName: 'div',
  className: 'confirmCancelView box horizontal justify',
  template: _.template($('#confirm-cancel-template').html()),
  events: {
    'click .confirmButton': 'resolve',
    'click .cancelButton': 'reject'
  },

  initialize: function(options) {
    if (!options.destination) {
      throw new Error('needmore');
    }

    this.destination = options.destination;
    this.deferred = options.deferred || Q.defer();
    this.JSON = {
      confirm: options.confirm || 'Confirm',
      cancel: options.cancel || 'Cancel'
    };

    this.render();
  }
});

var LeftRightView = PositiveNegativeBase.extend({
  tagName: 'div',
  className: 'leftRightView box horizontal center',
  template: _.template($('#left-right-template').html()),
  events: {
    'click .left': 'negative',
    'click .right': 'positive'
  },

  positive: function() {
    this.pipeEvents.trigger('positive');
    LeftRightView.__super__.positive.apply(this);
  },

  negative: function() {
    this.pipeEvents.trigger('negative');
    LeftRightView.__super__.negative.apply(this);
  },

  initialize: function(options) {
    if (!options.destination || !options.events) {
      throw new Error('needmore');
    }

    this.destination = options.destination;

    // we switch to a system where every leftrightview has its own
    // events system to add support for git demonstration view taking control of the
    // click events
    this.pipeEvents = options.events;
    this.navEvents = _.clone(Backbone.Events);

    this.JSON = {
      showLeft: (options.showLeft === undefined) ? true : options.showLeft,
      lastNav: (options.lastNav === undefined) ? false : options.lastNav
    };

    this.render();
  }
});

var ModalView = Backbone.View.extend({
  tagName: 'div',
  className: 'modalView box horizontal center transitionOpacityLinear',
  template: _.template($('#modal-view-template').html()),

  getAnimationTime: function() { return 700; },

  initialize: function(options) {
    this.shown = false;
    this.render();
  },

  render: function() {
    // add ourselves to the DOM
    this.$el.html(this.template({}));
    $('body').append(this.el);
    // this doesnt necessarily show us though...
  },

  stealKeyboard: function() {
    Main.getEventBaton().stealBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().stealBaton('keyup', this.onKeyUp, this);
    Main.getEventBaton().stealBaton('windowFocus', this.onWindowFocus, this);
    Main.getEventBaton().stealBaton('documentClick', this.onDocumentClick, this);

    // blur the text input field so keydown events will not be caught by our
    // preventDefaulters, allowing people to still refresh and launch inspector (etc)
    $('#commandTextField').blur();
  },

  releaseKeyboard: function() {
    Main.getEventBaton().releaseBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().releaseBaton('keyup', this.onKeyUp, this);
    Main.getEventBaton().releaseBaton('windowFocus', this.onWindowFocus, this);
    Main.getEventBaton().releaseBaton('documentClick', this.onDocumentClick, this);

    Main.getEventBaton().trigger('windowFocus');
  },

  onWindowFocus: function(e) {
    //console.log('window focus doing nothing', e);
  },

  onDocumentClick: function(e) {
    //console.log('doc click doing nothing', e);
  },

  onKeyDown: function(e) {
    e.preventDefault();
  },

  onKeyUp: function(e) {
    e.preventDefault();
  },

  show: function() {
    this.toggleZ(true);
    // on reflow, change our class to animate. for whatever
    // reason if this is done immediately, chrome might combine
    // the two changes and lose the ability to animate and it looks bad.
    process.nextTick(_.bind(function() {
      this.toggleShow(true);
    }, this));
  },

  hide: function() {
    this.toggleShow(false);
    setTimeout(_.bind(function() {
      // if we are still hidden...
      if (!this.shown) {
        this.toggleZ(false);
      }
    }, this), this.getAnimationTime());
  },

  getInsideElement: function() {
    return this.$('.contentHolder');
  },

  toggleShow: function(value) {
    // this prevents releasing keyboard twice
    if (this.shown === value) { return; }

    if (value) {
      this.stealKeyboard();
    } else {
      this.releaseKeyboard();
    }

    this.shown = value;
    this.$el.toggleClass('show', value);
  },

  toggleZ: function(value) {
    this.$el.toggleClass('inFront', value);
  },

  tearDown: function() {
    this.$el.html('');
    $('body')[0].removeChild(this.el);
  }
});

var ModalTerminal = ContainedBase.extend({
  tagName: 'div',
  className: 'modalTerminal box flex1',
  template: _.template($('#terminal-window-template').html()),
  events: {
    'click div.inside': 'onClick'
  },

  initialize: function(options) {
    options = options || {};
    this.navEvents = options.events || _.clone(Backbone.Events);

    this.container = new ModalView();
    this.JSON = {
      title: options.title || 'Heed This Warning!'
    };

    this.render();
  },

  onClick: function() {
    this.navEvents.trigger('click');
  },

  getInsideElement: function() {
    return this.$('.inside');
  }
});

var ModalAlert = ContainedBase.extend({
  tagName: 'div',
  template: _.template($('#modal-alert-template').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      title: options.title || 'Something to say',
      text: options.text || 'Here is a paragraph',
      markdown: options.markdown
    };

    if (options.markdowns) {
      this.JSON.markdown = options.markdowns.join('\n');
    }

    this.container = new ModalTerminal({
      title: 'Alert!'
    });
    this.render();

    if (!options.wait) {
      this.show();
    }
  },

  render: function() {
    var HTML = (this.JSON.markdown) ?
      require('markdown').markdown.toHTML(this.JSON.markdown) :
      this.template(this.JSON);

    // call to super, not super elegant but better than
    // copy paste code
    ModalAlert.__super__.render.apply(this, [HTML]);
  }
});

var ConfirmCancelTerminal = Backbone.View.extend({
  initialize: function(options) {
    options = options || {};

    this.deferred = options.deferred || Q.defer();
    this.modalAlert = new ModalAlert(_.extend(
      {},
      { markdown: '#you sure?' },
      options
    ));

    var buttonDefer = Q.defer();
    this.buttonDefer = buttonDefer;
    this.confirmCancel = new ConfirmCancelView({
      deferred: buttonDefer,
      destination: this.modalAlert.getDestination()
    });

    // whenever they hit a button. make sure
    // we close and pass that to our deferred
    buttonDefer.promise
    .then(this.deferred.resolve)
    .fail(this.deferred.reject)
    .done(_.bind(function() {
      this.close();
    }, this));

    // also setup keyboard
    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('negative', this.negative, this);
    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        enter: 'positive',
        esc: 'negative'
      }
    });

    if (!options.wait) {
      this.modalAlert.show();
    }
  },

  positive: function() {
    this.buttonDefer.resolve();
  },

  negative: function() {
    this.buttonDefer.reject();
  },

  getAnimationTime: function() { return 700; },

  show: function() {
    this.modalAlert.show();
  },

  hide: function() {
    this.modalAlert.hide();
  },

  getPromise: function() {
    return this.deferred.promise;
  },

  close: function() {
    this.keyboardListener.mute();
    this.modalAlert.die();
  }
});

var NextLevelConfirm = ConfirmCancelTerminal.extend({
  initialize: function(options) {
    options = options || {};
    var nextLevelName = (options.nextLevel) ? options.nextLevel.name : '';

    var markdowns = [
      '## Great Job!!',
      '',
      'You solved the level in **' + options.numCommands + '** command(s); ',
      'our solution uses ' + options.best + '. '
    ];

    if (options.numCommands <= options.best) {
      markdowns.push(
        'Awesome! You matched or exceeded our solution. '
      );
    } else {
      markdowns.push(
        'See if you can whittle it down to ' + options.best + ' command(s) :D '
      );
    }

    if (options.nextLevel) {
      markdowns = markdowns.concat([
        '',
        'Would you like to move onto "',
        nextLevelName + '", the next level?'
      ]);
    } else {
      markdowns = markdowns.concat([
        '',
        'Wow!!! You finished the last level, congratulations!'
      ]);
    }

    options = _.extend(
      {},
      options,
      { markdowns: markdowns }
    );

    NextLevelConfirm.__super__.initialize.apply(this, [options]);
  }
});

var ViewportAlert = Backbone.View.extend({
  initialize: function(options) {
    this.grabBatons();
    this.modalAlert = new ModalAlert({
      markdowns: this.markdowns
    });
    this.modalAlert.show();
  },

  grabBatons: function() {
    Main.getEventBaton().stealBaton(this.eventBatonName, this.batonFired, this);
  },

  releaseBatons: function() {
    Main.getEventBaton().releaseBaton(this.eventBatonName, this.batonFired, this);
  },

  finish: function() {
    this.releaseBatons();
    this.modalAlert.die();
  }
});

var WindowSizeAlertWindow = ViewportAlert.extend({
  initialize: function(options) {
    this.eventBatonName = 'windowSizeCheck';
    this.markdowns = [
      '## That window size is not supported :-/',
      'Please resize your window back to a supported size',
      '',
      '(and of course, pull requests to fix this are appreciated :D)'
    ];
    WindowSizeAlertWindow.__super__.initialize.apply(this, [options]);
  },

  batonFired: function(size) {
    if (size.w > Constants.VIEWPORT.minWidth &&
        size.h > Constants.VIEWPORT.minHeight) {
      this.finish();
    }
  }
});

var ZoomAlertWindow = ViewportAlert.extend({
  initialize: function(options) {
    if (!options || !options.level) { throw new Error('need level'); }

    this.eventBatonName = 'zoomChange';
    this.markdowns = [
      '## That zoom level of ' + options.level + ' is not supported :-/',
      'Please zoom back to a supported zoom level with Ctrl + and Ctrl -',
      '',
      '(and of course, pull requests to fix this are appreciated :D)'
    ];
    ZoomAlertWindow.__super__.initialize.apply(this, [options]);
  },

  batonFired: function(level) {
    if (level <= Constants.VIEWPORT.maxZoom &&
        level >= Constants.VIEWPORT.minZoom) {
      this.finish();
    }
  }
});

var LevelToolbar = BaseView.extend({
  tagName: 'div',
  className: 'levelToolbarHolder',
  template: _.template($('#level-toolbar-template').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      name: options.name || 'Some level! (unknown name)'
    };

    this.beforeDestination = $($('#commandLineHistory div.toolbar')[0]);
    this.render();

    if (!options.wait) {
      process.nextTick(_.bind(this.show, this));
    }
  },

  getAnimationTime: function() { return 700; },

  render: function() {
    var HTML = this.template(this.JSON);

    this.$el.html(HTML);
    this.beforeDestination.after(this.el);
  },

  die: function() {
    this.hide();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this), this.getAnimationTime());
  },

  hide: function() {
    this.$('div.toolbar').toggleClass('hidden', true);
  },

  show: function() {
    this.$('div.toolbar').toggleClass('hidden', false);
  }
});

var CanvasTerminalHolder = BaseView.extend({
  tagName: 'div',
  className: 'canvasTerminalHolder box flex1',
  template: _.template($('#terminal-window-bare-template').html()),
  events: {
    'click div.wrapper': 'onClick'
  },

  initialize: function(options) {
    options = options || {};
    this.destination = $('body');
    this.JSON = {
      title: options.title || 'Goal To Reach',
      text: options.text || 'You can hide this window with "hide goal"'
    };

    this.render();

    if (options.additionalClass) {
      this.$el.addClass(options.additionalClass);
    }
  },

  getAnimationTime: function() { return 700; },

  onClick: function() {
    this.slideOut();
  },

  die: function() {
    this.slideOut();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this));
  },

  slideOut: function() {
    this.slideToggle(true);
  },

  slideIn: function() {
    this.slideToggle(false);
  },

  slideToggle: function(value) {
    this.$('div.terminal-window-holder').toggleClass('slideOut', value);
  },

  getCanvasLocation: function() {
    return this.$('div.inside')[0];
  }
});

exports.BaseView = BaseView;
exports.GeneralButton = GeneralButton;
exports.ModalView = ModalView;
exports.ModalTerminal = ModalTerminal;
exports.ModalAlert = ModalAlert;
exports.ContainedBase = ContainedBase;
exports.ConfirmCancelView = ConfirmCancelView;
exports.LeftRightView = LeftRightView;
exports.ZoomAlertWindow = ZoomAlertWindow;
exports.ConfirmCancelTerminal = ConfirmCancelTerminal;
exports.WindowSizeAlertWindow = WindowSizeAlertWindow;

exports.CanvasTerminalHolder = CanvasTerminalHolder;
exports.LevelToolbar = LevelToolbar;
exports.NextLevelConfirm = NextLevelConfirm;


});

require.define("/src/js/util/keyboard.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var Main = require('../app');

var mapKeycodeToKey = function(keycode) {
  // HELP WANTED -- internationalize? Dvorak? I have no idea
  var keyMap = {
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    27: 'esc',
    13: 'enter'
  };
  return keyMap[keycode];
};

function KeyboardListener(options) {
  this.events = options.events || _.clone(Backbone.Events);
  this.aliasMap = options.aliasMap || {};

  if (!options.wait) {
    this.listen();
  }
}

KeyboardListener.prototype.listen = function() {
  if (this.listening) {
    return;
  }
  this.listening = true;
  Main.getEventBaton().stealBaton('docKeydown', this.keydown, this);
};

KeyboardListener.prototype.mute = function() {
  this.listening = false;
  Main.getEventBaton().releaseBaton('docKeydown', this.keydown, this);
};

KeyboardListener.prototype.keydown = function(e) {
  var which = e.which || e.keyCode;

  var key = mapKeycodeToKey(which);
  if (key === undefined) {
    return;
  }

  this.fireEvent(key, e);
};

KeyboardListener.prototype.fireEvent = function(eventName, e) {
  eventName = this.aliasMap[eventName] || eventName;
  this.events.trigger(eventName, e);
};

KeyboardListener.prototype.passEventBack = function(e) {
  Main.getEventBaton().passBatonBackSoft('docKeydown', this.keydown, this, [e]);
};

exports.KeyboardListener = KeyboardListener;
exports.mapKeycodeToKey = mapKeycodeToKey;


});

require.define("/node_modules/markdown/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./lib/index.js"}
});

require.define("/node_modules/markdown/lib/index.js",function(require,module,exports,__dirname,__filename,process,global){// super simple module for the most common nodejs use case.
exports.markdown = require("./markdown");
exports.parse = exports.markdown.toHTML;

});

require.define("/node_modules/markdown/lib/markdown.js",function(require,module,exports,__dirname,__filename,process,global){// Released under MIT license
// Copyright (c) 2009-2010 Dominic Baggott
// Copyright (c) 2009-2010 Ash Berlin
// Copyright (c) 2011 Christoph Dorn <christoph@christophdorn.com> (http://www.christophdorn.com)

(function( expose ) {

/**
 *  class Markdown
 *
 *  Markdown processing in Javascript done right. We have very particular views
 *  on what constitutes 'right' which include:
 *
 *  - produces well-formed HTML (this means that em and strong nesting is
 *    important)
 *
 *  - has an intermediate representation to allow processing of parsed data (We
 *    in fact have two, both as [JsonML]: a markdown tree and an HTML tree).
 *
 *  - is easily extensible to add new dialects without having to rewrite the
 *    entire parsing mechanics
 *
 *  - has a good test suite
 *
 *  This implementation fulfills all of these (except that the test suite could
 *  do with expanding to automatically run all the fixtures from other Markdown
 *  implementations.)
 *
 *  ##### Intermediate Representation
 *
 *  *TODO* Talk about this :) Its JsonML, but document the node names we use.
 *
 *  [JsonML]: http://jsonml.org/ "JSON Markup Language"
 **/
var Markdown = expose.Markdown = function Markdown(dialect) {
  switch (typeof dialect) {
    case "undefined":
      this.dialect = Markdown.dialects.Gruber;
      break;
    case "object":
      this.dialect = dialect;
      break;
    default:
      if (dialect in Markdown.dialects) {
        this.dialect = Markdown.dialects[dialect];
      }
      else {
        throw new Error("Unknown Markdown dialect '" + String(dialect) + "'");
      }
      break;
  }
  this.em_state = [];
  this.strong_state = [];
  this.debug_indent = "";
};

/**
 *  parse( markdown, [dialect] ) -> JsonML
 *  - markdown (String): markdown string to parse
 *  - dialect (String | Dialect): the dialect to use, defaults to gruber
 *
 *  Parse `markdown` and return a markdown document as a Markdown.JsonML tree.
 **/
expose.parse = function( source, dialect ) {
  // dialect will default if undefined
  var md = new Markdown( dialect );
  return md.toTree( source );
};

/**
 *  toHTML( markdown, [dialect]  ) -> String
 *  toHTML( md_tree ) -> String
 *  - markdown (String): markdown string to parse
 *  - md_tree (Markdown.JsonML): parsed markdown tree
 *
 *  Take markdown (either as a string or as a JsonML tree) and run it through
 *  [[toHTMLTree]] then turn it into a well-formated HTML fragment.
 **/
expose.toHTML = function toHTML( source , dialect , options ) {
  var input = expose.toHTMLTree( source , dialect , options );

  return expose.renderJsonML( input );
};

/**
 *  toHTMLTree( markdown, [dialect] ) -> JsonML
 *  toHTMLTree( md_tree ) -> JsonML
 *  - markdown (String): markdown string to parse
 *  - dialect (String | Dialect): the dialect to use, defaults to gruber
 *  - md_tree (Markdown.JsonML): parsed markdown tree
 *
 *  Turn markdown into HTML, represented as a JsonML tree. If a string is given
 *  to this function, it is first parsed into a markdown tree by calling
 *  [[parse]].
 **/
expose.toHTMLTree = function toHTMLTree( input, dialect , options ) {
  // convert string input to an MD tree
  if ( typeof input ==="string" ) input = this.parse( input, dialect );

  // Now convert the MD tree to an HTML tree

  // remove references from the tree
  var attrs = extract_attr( input ),
      refs = {};

  if ( attrs && attrs.references ) {
    refs = attrs.references;
  }

  var html = convert_tree_to_html( input, refs , options );
  merge_text_nodes( html );
  return html;
};

// For Spidermonkey based engines
function mk_block_toSource() {
  return "Markdown.mk_block( " +
          uneval(this.toString()) +
          ", " +
          uneval(this.trailing) +
          ", " +
          uneval(this.lineNumber) +
          " )";
}

// node
function mk_block_inspect() {
  var util = require('util');
  return "Markdown.mk_block( " +
          util.inspect(this.toString()) +
          ", " +
          util.inspect(this.trailing) +
          ", " +
          util.inspect(this.lineNumber) +
          " )";

}

var mk_block = Markdown.mk_block = function(block, trail, line) {
  // Be helpful for default case in tests.
  if ( arguments.length == 1 ) trail = "\n\n";

  var s = new String(block);
  s.trailing = trail;
  // To make it clear its not just a string
  s.inspect = mk_block_inspect;
  s.toSource = mk_block_toSource;

  if (line != undefined)
    s.lineNumber = line;

  return s;
};

function count_lines( str ) {
  var n = 0, i = -1;
  while ( ( i = str.indexOf('\n', i+1) ) !== -1) n++;
  return n;
}

// Internal - split source into rough blocks
Markdown.prototype.split_blocks = function splitBlocks( input, startLine ) {
  // [\s\S] matches _anything_ (newline or space)
  var re = /([\s\S]+?)($|\n(?:\s*\n|$)+)/g,
      blocks = [],
      m;

  var line_no = 1;

  if ( ( m = /^(\s*\n)/.exec(input) ) != null ) {
    // skip (but count) leading blank lines
    line_no += count_lines( m[0] );
    re.lastIndex = m[0].length;
  }

  while ( ( m = re.exec(input) ) !== null ) {
    blocks.push( mk_block( m[1], m[2], line_no ) );
    line_no += count_lines( m[0] );
  }

  return blocks;
};

/**
 *  Markdown#processBlock( block, next ) -> undefined | [ JsonML, ... ]
 *  - block (String): the block to process
 *  - next (Array): the following blocks
 *
 * Process `block` and return an array of JsonML nodes representing `block`.
 *
 * It does this by asking each block level function in the dialect to process
 * the block until one can. Succesful handling is indicated by returning an
 * array (with zero or more JsonML nodes), failure by a false value.
 *
 * Blocks handlers are responsible for calling [[Markdown#processInline]]
 * themselves as appropriate.
 *
 * If the blocks were split incorrectly or adjacent blocks need collapsing you
 * can adjust `next` in place using shift/splice etc.
 *
 * If any of this default behaviour is not right for the dialect, you can
 * define a `__call__` method on the dialect that will get invoked to handle
 * the block processing.
 */
Markdown.prototype.processBlock = function processBlock( block, next ) {
  var cbs = this.dialect.block,
      ord = cbs.__order__;

  if ( "__call__" in cbs ) {
    return cbs.__call__.call(this, block, next);
  }

  for ( var i = 0; i < ord.length; i++ ) {
    //D:this.debug( "Testing", ord[i] );
    var res = cbs[ ord[i] ].call( this, block, next );
    if ( res ) {
      //D:this.debug("  matched");
      if ( !isArray(res) || ( res.length > 0 && !( isArray(res[0]) ) ) )
        this.debug(ord[i], "didn't return a proper array");
      //D:this.debug( "" );
      return res;
    }
  }

  // Uhoh! no match! Should we throw an error?
  return [];
};

Markdown.prototype.processInline = function processInline( block ) {
  return this.dialect.inline.__call__.call( this, String( block ) );
};

/**
 *  Markdown#toTree( source ) -> JsonML
 *  - source (String): markdown source to parse
 *
 *  Parse `source` into a JsonML tree representing the markdown document.
 **/
// custom_tree means set this.tree to `custom_tree` and restore old value on return
Markdown.prototype.toTree = function toTree( source, custom_root ) {
  var blocks = source instanceof Array ? source : this.split_blocks( source );

  // Make tree a member variable so its easier to mess with in extensions
  var old_tree = this.tree;
  try {
    this.tree = custom_root || this.tree || [ "markdown" ];

    blocks:
    while ( blocks.length ) {
      var b = this.processBlock( blocks.shift(), blocks );

      // Reference blocks and the like won't return any content
      if ( !b.length ) continue blocks;

      this.tree.push.apply( this.tree, b );
    }
    return this.tree;
  }
  finally {
    if ( custom_root ) {
      this.tree = old_tree;
    }
  }
};

// Noop by default
Markdown.prototype.debug = function () {
  var args = Array.prototype.slice.call( arguments);
  args.unshift(this.debug_indent);
  if (typeof print !== "undefined")
      print.apply( print, args );
  if (typeof console !== "undefined" && typeof console.log !== "undefined")
      console.log.apply( null, args );
}

Markdown.prototype.loop_re_over_block = function( re, block, cb ) {
  // Dont use /g regexps with this
  var m,
      b = block.valueOf();

  while ( b.length && (m = re.exec(b) ) != null) {
    b = b.substr( m[0].length );
    cb.call(this, m);
  }
  return b;
};

/**
 * Markdown.dialects
 *
 * Namespace of built-in dialects.
 **/
Markdown.dialects = {};

/**
 * Markdown.dialects.Gruber
 *
 * The default dialect that follows the rules set out by John Gruber's
 * markdown.pl as closely as possible. Well actually we follow the behaviour of
 * that script which in some places is not exactly what the syntax web page
 * says.
 **/
Markdown.dialects.Gruber = {
  block: {
    atxHeader: function atxHeader( block, next ) {
      var m = block.match( /^(#{1,6})\s*(.*?)\s*#*\s*(?:\n|$)/ );

      if ( !m ) return undefined;

      var header = [ "header", { level: m[ 1 ].length } ];
      Array.prototype.push.apply(header, this.processInline(m[ 2 ]));

      if ( m[0].length < block.length )
        next.unshift( mk_block( block.substr( m[0].length ), block.trailing, block.lineNumber + 2 ) );

      return [ header ];
    },

    setextHeader: function setextHeader( block, next ) {
      var m = block.match( /^(.*)\n([-=])\2\2+(?:\n|$)/ );

      if ( !m ) return undefined;

      var level = ( m[ 2 ] === "=" ) ? 1 : 2;
      var header = [ "header", { level : level }, m[ 1 ] ];

      if ( m[0].length < block.length )
        next.unshift( mk_block( block.substr( m[0].length ), block.trailing, block.lineNumber + 2 ) );

      return [ header ];
    },

    code: function code( block, next ) {
      // |    Foo
      // |bar
      // should be a code block followed by a paragraph. Fun
      //
      // There might also be adjacent code block to merge.

      var ret = [],
          re = /^(?: {0,3}\t| {4})(.*)\n?/,
          lines;

      // 4 spaces + content
      if ( !block.match( re ) ) return undefined;

      block_search:
      do {
        // Now pull out the rest of the lines
        var b = this.loop_re_over_block(
                  re, block.valueOf(), function( m ) { ret.push( m[1] ); } );

        if (b.length) {
          // Case alluded to in first comment. push it back on as a new block
          next.unshift( mk_block(b, block.trailing) );
          break block_search;
        }
        else if (next.length) {
          // Check the next block - it might be code too
          if ( !next[0].match( re ) ) break block_search;

          // Pull how how many blanks lines follow - minus two to account for .join
          ret.push ( block.trailing.replace(/[^\n]/g, '').substring(2) );

          block = next.shift();
        }
        else {
          break block_search;
        }
      } while (true);

      return [ [ "code_block", ret.join("\n") ] ];
    },

    horizRule: function horizRule( block, next ) {
      // this needs to find any hr in the block to handle abutting blocks
      var m = block.match( /^(?:([\s\S]*?)\n)?[ \t]*([-_*])(?:[ \t]*\2){2,}[ \t]*(?:\n([\s\S]*))?$/ );

      if ( !m ) {
        return undefined;
      }

      var jsonml = [ [ "hr" ] ];

      // if there's a leading abutting block, process it
      if ( m[ 1 ] ) {
        jsonml.unshift.apply( jsonml, this.processBlock( m[ 1 ], [] ) );
      }

      // if there's a trailing abutting block, stick it into next
      if ( m[ 3 ] ) {
        next.unshift( mk_block( m[ 3 ] ) );
      }

      return jsonml;
    },

    // There are two types of lists. Tight and loose. Tight lists have no whitespace
    // between the items (and result in text just in the <li>) and loose lists,
    // which have an empty line between list items, resulting in (one or more)
    // paragraphs inside the <li>.
    //
    // There are all sorts weird edge cases about the original markdown.pl's
    // handling of lists:
    //
    // * Nested lists are supposed to be indented by four chars per level. But
    //   if they aren't, you can get a nested list by indenting by less than
    //   four so long as the indent doesn't match an indent of an existing list
    //   item in the 'nest stack'.
    //
    // * The type of the list (bullet or number) is controlled just by the
    //    first item at the indent. Subsequent changes are ignored unless they
    //    are for nested lists
    //
    lists: (function( ) {
      // Use a closure to hide a few variables.
      var any_list = "[*+-]|\\d+\\.",
          bullet_list = /[*+-]/,
          number_list = /\d+\./,
          // Capture leading indent as it matters for determining nested lists.
          is_list_re = new RegExp( "^( {0,3})(" + any_list + ")[ \t]+" ),
          indent_re = "(?: {0,3}\\t| {4})";

      // TODO: Cache this regexp for certain depths.
      // Create a regexp suitable for matching an li for a given stack depth
      function regex_for_depth( depth ) {

        return new RegExp(
          // m[1] = indent, m[2] = list_type
          "(?:^(" + indent_re + "{0," + depth + "} {0,3})(" + any_list + ")\\s+)|" +
          // m[3] = cont
          "(^" + indent_re + "{0," + (depth-1) + "}[ ]{0,4})"
        );
      }
      function expand_tab( input ) {
        return input.replace( / {0,3}\t/g, "    " );
      }

      // Add inline content `inline` to `li`. inline comes from processInline
      // so is an array of content
      function add(li, loose, inline, nl) {
        if (loose) {
          li.push( [ "para" ].concat(inline) );
          return;
        }
        // Hmmm, should this be any block level element or just paras?
        var add_to = li[li.length -1] instanceof Array && li[li.length - 1][0] == "para"
                   ? li[li.length -1]
                   : li;

        // If there is already some content in this list, add the new line in
        if (nl && li.length > 1) inline.unshift(nl);

        for (var i=0; i < inline.length; i++) {
          var what = inline[i],
              is_str = typeof what == "string";
          if (is_str && add_to.length > 1 && typeof add_to[add_to.length-1] == "string" ) {
            add_to[ add_to.length-1 ] += what;
          }
          else {
            add_to.push( what );
          }
        }
      }

      // contained means have an indent greater than the current one. On
      // *every* line in the block
      function get_contained_blocks( depth, blocks ) {

        var re = new RegExp( "^(" + indent_re + "{" + depth + "}.*?\\n?)*$" ),
            replace = new RegExp("^" + indent_re + "{" + depth + "}", "gm"),
            ret = [];

        while ( blocks.length > 0 ) {
          if ( re.exec( blocks[0] ) ) {
            var b = blocks.shift(),
                // Now remove that indent
                x = b.replace( replace, "");

            ret.push( mk_block( x, b.trailing, b.lineNumber ) );
          }
          break;
        }
        return ret;
      }

      // passed to stack.forEach to turn list items up the stack into paras
      function paragraphify(s, i, stack) {
        var list = s.list;
        var last_li = list[list.length-1];

        if (last_li[1] instanceof Array && last_li[1][0] == "para") {
          return;
        }
        if (i+1 == stack.length) {
          // Last stack frame
          // Keep the same array, but replace the contents
          last_li.push( ["para"].concat( last_li.splice(1) ) );
        }
        else {
          var sublist = last_li.pop();
          last_li.push( ["para"].concat( last_li.splice(1) ), sublist );
        }
      }

      // The matcher function
      return function( block, next ) {
        var m = block.match( is_list_re );
        if ( !m ) return undefined;

        function make_list( m ) {
          var list = bullet_list.exec( m[2] )
                   ? ["bulletlist"]
                   : ["numberlist"];

          stack.push( { list: list, indent: m[1] } );
          return list;
        }


        var stack = [], // Stack of lists for nesting.
            list = make_list( m ),
            last_li,
            loose = false,
            ret = [ stack[0].list ],
            i;

        // Loop to search over block looking for inner block elements and loose lists
        loose_search:
        while( true ) {
          // Split into lines preserving new lines at end of line
          var lines = block.split( /(?=\n)/ );

          // We have to grab all lines for a li and call processInline on them
          // once as there are some inline things that can span lines.
          var li_accumulate = "";

          // Loop over the lines in this block looking for tight lists.
          tight_search:
          for (var line_no=0; line_no < lines.length; line_no++) {
            var nl = "",
                l = lines[line_no].replace(/^\n/, function(n) { nl = n; return ""; });

            // TODO: really should cache this
            var line_re = regex_for_depth( stack.length );

            m = l.match( line_re );
            //print( "line:", uneval(l), "\nline match:", uneval(m) );

            // We have a list item
            if ( m[1] !== undefined ) {
              // Process the previous list item, if any
              if ( li_accumulate.length ) {
                add( last_li, loose, this.processInline( li_accumulate ), nl );
                // Loose mode will have been dealt with. Reset it
                loose = false;
                li_accumulate = "";
              }

              m[1] = expand_tab( m[1] );
              var wanted_depth = Math.floor(m[1].length/4)+1;
              //print( "want:", wanted_depth, "stack:", stack.length);
              if ( wanted_depth > stack.length ) {
                // Deep enough for a nested list outright
                //print ( "new nested list" );
                list = make_list( m );
                last_li.push( list );
                last_li = list[1] = [ "listitem" ];
              }
              else {
                // We aren't deep enough to be strictly a new level. This is
                // where Md.pl goes nuts. If the indent matches a level in the
                // stack, put it there, else put it one deeper then the
                // wanted_depth deserves.
                var found = false;
                for (i = 0; i < stack.length; i++) {
                  if ( stack[ i ].indent != m[1] ) continue;
                  list = stack[ i ].list;
                  stack.splice( i+1 );
                  found = true;
                  break;
                }

                if (!found) {
                  //print("not found. l:", uneval(l));
                  wanted_depth++;
                  if (wanted_depth <= stack.length) {
                    stack.splice(wanted_depth);
                    //print("Desired depth now", wanted_depth, "stack:", stack.length);
                    list = stack[wanted_depth-1].list;
                    //print("list:", uneval(list) );
                  }
                  else {
                    //print ("made new stack for messy indent");
                    list = make_list(m);
                    last_li.push(list);
                  }
                }

                //print( uneval(list), "last", list === stack[stack.length-1].list );
                last_li = [ "listitem" ];
                list.push(last_li);
              } // end depth of shenegains
              nl = "";
            }

            // Add content
            if (l.length > m[0].length) {
              li_accumulate += nl + l.substr( m[0].length );
            }
          } // tight_search

          if ( li_accumulate.length ) {
            add( last_li, loose, this.processInline( li_accumulate ), nl );
            // Loose mode will have been dealt with. Reset it
            loose = false;
            li_accumulate = "";
          }

          // Look at the next block - we might have a loose list. Or an extra
          // paragraph for the current li
          var contained = get_contained_blocks( stack.length, next );

          // Deal with code blocks or properly nested lists
          if (contained.length > 0) {
            // Make sure all listitems up the stack are paragraphs
            forEach( stack, paragraphify, this);

            last_li.push.apply( last_li, this.toTree( contained, [] ) );
          }

          var next_block = next[0] && next[0].valueOf() || "";

          if ( next_block.match(is_list_re) || next_block.match( /^ / ) ) {
            block = next.shift();

            // Check for an HR following a list: features/lists/hr_abutting
            var hr = this.dialect.block.horizRule( block, next );

            if (hr) {
              ret.push.apply(ret, hr);
              break;
            }

            // Make sure all listitems up the stack are paragraphs
            forEach( stack, paragraphify, this);

            loose = true;
            continue loose_search;
          }
          break;
        } // loose_search

        return ret;
      };
    })(),

    blockquote: function blockquote( block, next ) {
      if ( !block.match( /^>/m ) )
        return undefined;

      var jsonml = [];

      // separate out the leading abutting block, if any
      if ( block[ 0 ] != ">" ) {
        var lines = block.split( /\n/ ),
            prev = [];

        // keep shifting lines until you find a crotchet
        while ( lines.length && lines[ 0 ][ 0 ] != ">" ) {
            prev.push( lines.shift() );
        }

        // reassemble!
        block = lines.join( "\n" );
        jsonml.push.apply( jsonml, this.processBlock( prev.join( "\n" ), [] ) );
      }

      // if the next block is also a blockquote merge it in
      while ( next.length && next[ 0 ][ 0 ] == ">" ) {
        var b = next.shift();
        block = new String(block + block.trailing + b);
        block.trailing = b.trailing;
      }

      // Strip off the leading "> " and re-process as a block.
      var input = block.replace( /^> ?/gm, '' ),
          old_tree = this.tree;
      jsonml.push( this.toTree( input, [ "blockquote" ] ) );

      return jsonml;
    },

    referenceDefn: function referenceDefn( block, next) {
      var re = /^\s*\[(.*?)\]:\s*(\S+)(?:\s+(?:(['"])(.*?)\3|\((.*?)\)))?\n?/;
      // interesting matches are [ , ref_id, url, , title, title ]

      if ( !block.match(re) )
        return undefined;

      // make an attribute node if it doesn't exist
      if ( !extract_attr( this.tree ) ) {
        this.tree.splice( 1, 0, {} );
      }

      var attrs = extract_attr( this.tree );

      // make a references hash if it doesn't exist
      if ( attrs.references === undefined ) {
        attrs.references = {};
      }

      var b = this.loop_re_over_block(re, block, function( m ) {

        if ( m[2] && m[2][0] == '<' && m[2][m[2].length-1] == '>' )
          m[2] = m[2].substring( 1, m[2].length - 1 );

        var ref = attrs.references[ m[1].toLowerCase() ] = {
          href: m[2]
        };

        if (m[4] !== undefined)
          ref.title = m[4];
        else if (m[5] !== undefined)
          ref.title = m[5];

      } );

      if (b.length)
        next.unshift( mk_block( b, block.trailing ) );

      return [];
    },

    para: function para( block, next ) {
      // everything's a para!
      return [ ["para"].concat( this.processInline( block ) ) ];
    }
  }
};

Markdown.dialects.Gruber.inline = {

    __oneElement__: function oneElement( text, patterns_or_re, previous_nodes ) {
      var m,
          res,
          lastIndex = 0;

      patterns_or_re = patterns_or_re || this.dialect.inline.__patterns__;
      var re = new RegExp( "([\\s\\S]*?)(" + (patterns_or_re.source || patterns_or_re) + ")" );

      m = re.exec( text );
      if (!m) {
        // Just boring text
        return [ text.length, text ];
      }
      else if ( m[1] ) {
        // Some un-interesting text matched. Return that first
        return [ m[1].length, m[1] ];
      }

      var res;
      if ( m[2] in this.dialect.inline ) {
        res = this.dialect.inline[ m[2] ].call(
                  this,
                  text.substr( m.index ), m, previous_nodes || [] );
      }
      // Default for now to make dev easier. just slurp special and output it.
      res = res || [ m[2].length, m[2] ];
      return res;
    },

    __call__: function inline( text, patterns ) {

      var out = [],
          res;

      function add(x) {
        //D:self.debug("  adding output", uneval(x));
        if (typeof x == "string" && typeof out[out.length-1] == "string")
          out[ out.length-1 ] += x;
        else
          out.push(x);
      }

      while ( text.length > 0 ) {
        res = this.dialect.inline.__oneElement__.call(this, text, patterns, out );
        text = text.substr( res.shift() );
        forEach(res, add )
      }

      return out;
    },

    // These characters are intersting elsewhere, so have rules for them so that
    // chunks of plain text blocks don't include them
    "]": function () {},
    "}": function () {},

    "\\": function escaped( text ) {
      // [ length of input processed, node/children to add... ]
      // Only esacape: \ ` * _ { } [ ] ( ) # * + - . !
      if ( text.match( /^\\[\\`\*_{}\[\]()#\+.!\-]/ ) )
        return [ 2, text[1] ];
      else
        // Not an esacpe
        return [ 1, "\\" ];
    },

    "![": function image( text ) {

      // Unlike images, alt text is plain text only. no other elements are
      // allowed in there

      // ![Alt text](/path/to/img.jpg "Optional title")
      //      1          2            3       4         <--- captures
      var m = text.match( /^!\[(.*?)\][ \t]*\([ \t]*(\S*)(?:[ \t]+(["'])(.*?)\3)?[ \t]*\)/ );

      if ( m ) {
        if ( m[2] && m[2][0] == '<' && m[2][m[2].length-1] == '>' )
          m[2] = m[2].substring( 1, m[2].length - 1 );

        m[2] = this.dialect.inline.__call__.call( this, m[2], /\\/ )[0];

        var attrs = { alt: m[1], href: m[2] || "" };
        if ( m[4] !== undefined)
          attrs.title = m[4];

        return [ m[0].length, [ "img", attrs ] ];
      }

      // ![Alt text][id]
      m = text.match( /^!\[(.*?)\][ \t]*\[(.*?)\]/ );

      if ( m ) {
        // We can't check if the reference is known here as it likely wont be
        // found till after. Check it in md tree->hmtl tree conversion
        return [ m[0].length, [ "img_ref", { alt: m[1], ref: m[2].toLowerCase(), original: m[0] } ] ];
      }

      // Just consume the '!['
      return [ 2, "![" ];
    },

    "[": function link( text ) {

      var orig = String(text);
      // Inline content is possible inside `link text`
      var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), ']' );

      // No closing ']' found. Just consume the [
      if ( !res ) return [ 1, '[' ];

      var consumed = 1 + res[ 0 ],
          children = res[ 1 ],
          link,
          attrs;

      // At this point the first [...] has been parsed. See what follows to find
      // out which kind of link we are (reference or direct url)
      text = text.substr( consumed );

      // [link text](/path/to/img.jpg "Optional title")
      //                 1            2       3         <--- captures
      // This will capture up to the last paren in the block. We then pull
      // back based on if there a matching ones in the url
      //    ([here](/url/(test))
      // The parens have to be balanced
      var m = text.match( /^\s*\([ \t]*(\S+)(?:[ \t]+(["'])(.*?)\2)?[ \t]*\)/ );
      if ( m ) {
        var url = m[1];
        consumed += m[0].length;

        if ( url && url[0] == '<' && url[url.length-1] == '>' )
          url = url.substring( 1, url.length - 1 );

        // If there is a title we don't have to worry about parens in the url
        if ( !m[3] ) {
          var open_parens = 1; // One open that isn't in the capture
          for (var len = 0; len < url.length; len++) {
            switch ( url[len] ) {
            case '(':
              open_parens++;
              break;
            case ')':
              if ( --open_parens == 0) {
                consumed -= url.length - len;
                url = url.substring(0, len);
              }
              break;
            }
          }
        }

        // Process escapes only
        url = this.dialect.inline.__call__.call( this, url, /\\/ )[0];

        attrs = { href: url || "" };
        if ( m[3] !== undefined)
          attrs.title = m[3];

        link = [ "link", attrs ].concat( children );
        return [ consumed, link ];
      }

      // [Alt text][id]
      // [Alt text] [id]
      m = text.match( /^\s*\[(.*?)\]/ );

      if ( m ) {

        consumed += m[ 0 ].length;

        // [links][] uses links as its reference
        attrs = { ref: ( m[ 1 ] || String(children) ).toLowerCase(),  original: orig.substr( 0, consumed ) };

        link = [ "link_ref", attrs ].concat( children );

        // We can't check if the reference is known here as it likely wont be
        // found till after. Check it in md tree->hmtl tree conversion.
        // Store the original so that conversion can revert if the ref isn't found.
        return [ consumed, link ];
      }

      // [id]
      // Only if id is plain (no formatting.)
      if ( children.length == 1 && typeof children[0] == "string" ) {

        attrs = { ref: children[0].toLowerCase(),  original: orig.substr( 0, consumed ) };
        link = [ "link_ref", attrs, children[0] ];
        return [ consumed, link ];
      }

      // Just consume the '['
      return [ 1, "[" ];
    },


    "<": function autoLink( text ) {
      var m;

      if ( ( m = text.match( /^<(?:((https?|ftp|mailto):[^>]+)|(.*?@.*?\.[a-zA-Z]+))>/ ) ) != null ) {
        if ( m[3] ) {
          return [ m[0].length, [ "link", { href: "mailto:" + m[3] }, m[3] ] ];

        }
        else if ( m[2] == "mailto" ) {
          return [ m[0].length, [ "link", { href: m[1] }, m[1].substr("mailto:".length ) ] ];
        }
        else
          return [ m[0].length, [ "link", { href: m[1] }, m[1] ] ];
      }

      return [ 1, "<" ];
    },

    "`": function inlineCode( text ) {
      // Inline code block. as many backticks as you like to start it
      // Always skip over the opening ticks.
      var m = text.match( /(`+)(([\s\S]*?)\1)/ );

      if ( m && m[2] )
        return [ m[1].length + m[2].length, [ "inlinecode", m[3] ] ];
      else {
        // TODO: No matching end code found - warn!
        return [ 1, "`" ];
      }
    },

    "  \n": function lineBreak( text ) {
      return [ 3, [ "linebreak" ] ];
    }

};

// Meta Helper/generator method for em and strong handling
function strong_em( tag, md ) {

  var state_slot = tag + "_state",
      other_slot = tag == "strong" ? "em_state" : "strong_state";

  function CloseTag(len) {
    this.len_after = len;
    this.name = "close_" + md;
  }

  return function ( text, orig_match ) {

    if (this[state_slot][0] == md) {
      // Most recent em is of this type
      //D:this.debug("closing", md);
      this[state_slot].shift();

      // "Consume" everything to go back to the recrusion in the else-block below
      return[ text.length, new CloseTag(text.length-md.length) ];
    }
    else {
      // Store a clone of the em/strong states
      var other = this[other_slot].slice(),
          state = this[state_slot].slice();

      this[state_slot].unshift(md);

      //D:this.debug_indent += "  ";

      // Recurse
      var res = this.processInline( text.substr( md.length ) );
      //D:this.debug_indent = this.debug_indent.substr(2);

      var last = res[res.length - 1];

      //D:this.debug("processInline from", tag + ": ", uneval( res ) );

      var check = this[state_slot].shift();
      if (last instanceof CloseTag) {
        res.pop();
        // We matched! Huzzah.
        var consumed = text.length - last.len_after;
        return [ consumed, [ tag ].concat(res) ];
      }
      else {
        // Restore the state of the other kind. We might have mistakenly closed it.
        this[other_slot] = other;
        this[state_slot] = state;

        // We can't reuse the processed result as it could have wrong parsing contexts in it.
        return [ md.length, md ];
      }
    }
  }; // End returned function
}

Markdown.dialects.Gruber.inline["**"] = strong_em("strong", "**");
Markdown.dialects.Gruber.inline["__"] = strong_em("strong", "__");
Markdown.dialects.Gruber.inline["*"]  = strong_em("em", "*");
Markdown.dialects.Gruber.inline["_"]  = strong_em("em", "_");


// Build default order from insertion order.
Markdown.buildBlockOrder = function(d) {
  var ord = [];
  for ( var i in d ) {
    if ( i == "__order__" || i == "__call__" ) continue;
    ord.push( i );
  }
  d.__order__ = ord;
};

// Build patterns for inline matcher
Markdown.buildInlinePatterns = function(d) {
  var patterns = [];

  for ( var i in d ) {
    // __foo__ is reserved and not a pattern
    if ( i.match( /^__.*__$/) ) continue;
    var l = i.replace( /([\\.*+?|()\[\]{}])/g, "\\$1" )
             .replace( /\n/, "\\n" );
    patterns.push( i.length == 1 ? l : "(?:" + l + ")" );
  }

  patterns = patterns.join("|");
  d.__patterns__ = patterns;
  //print("patterns:", uneval( patterns ) );

  var fn = d.__call__;
  d.__call__ = function(text, pattern) {
    if (pattern != undefined) {
      return fn.call(this, text, pattern);
    }
    else
    {
      return fn.call(this, text, patterns);
    }
  };
};

Markdown.DialectHelpers = {};
Markdown.DialectHelpers.inline_until_char = function( text, want ) {
  var consumed = 0,
      nodes = [];

  while ( true ) {
    if ( text[ consumed ] == want ) {
      // Found the character we were looking for
      consumed++;
      return [ consumed, nodes ];
    }

    if ( consumed >= text.length ) {
      // No closing char found. Abort.
      return null;
    }

    res = this.dialect.inline.__oneElement__.call(this, text.substr( consumed ) );
    consumed += res[ 0 ];
    // Add any returned nodes.
    nodes.push.apply( nodes, res.slice( 1 ) );
  }
}

// Helper function to make sub-classing a dialect easier
Markdown.subclassDialect = function( d ) {
  function Block() {}
  Block.prototype = d.block;
  function Inline() {}
  Inline.prototype = d.inline;

  return { block: new Block(), inline: new Inline() };
};

Markdown.buildBlockOrder ( Markdown.dialects.Gruber.block );
Markdown.buildInlinePatterns( Markdown.dialects.Gruber.inline );

Markdown.dialects.Maruku = Markdown.subclassDialect( Markdown.dialects.Gruber );

Markdown.dialects.Maruku.processMetaHash = function processMetaHash( meta_string ) {
  var meta = split_meta_hash( meta_string ),
      attr = {};

  for ( var i = 0; i < meta.length; ++i ) {
    // id: #foo
    if ( /^#/.test( meta[ i ] ) ) {
      attr.id = meta[ i ].substring( 1 );
    }
    // class: .foo
    else if ( /^\./.test( meta[ i ] ) ) {
      // if class already exists, append the new one
      if ( attr['class'] ) {
        attr['class'] = attr['class'] + meta[ i ].replace( /./, " " );
      }
      else {
        attr['class'] = meta[ i ].substring( 1 );
      }
    }
    // attribute: foo=bar
    else if ( /\=/.test( meta[ i ] ) ) {
      var s = meta[ i ].split( /\=/ );
      attr[ s[ 0 ] ] = s[ 1 ];
    }
  }

  return attr;
}

function split_meta_hash( meta_string ) {
  var meta = meta_string.split( "" ),
      parts = [ "" ],
      in_quotes = false;

  while ( meta.length ) {
    var letter = meta.shift();
    switch ( letter ) {
      case " " :
        // if we're in a quoted section, keep it
        if ( in_quotes ) {
          parts[ parts.length - 1 ] += letter;
        }
        // otherwise make a new part
        else {
          parts.push( "" );
        }
        break;
      case "'" :
      case '"' :
        // reverse the quotes and move straight on
        in_quotes = !in_quotes;
        break;
      case "\\" :
        // shift off the next letter to be used straight away.
        // it was escaped so we'll keep it whatever it is
        letter = meta.shift();
      default :
        parts[ parts.length - 1 ] += letter;
        break;
    }
  }

  return parts;
}

Markdown.dialects.Maruku.block.document_meta = function document_meta( block, next ) {
  // we're only interested in the first block
  if ( block.lineNumber > 1 ) return undefined;

  // document_meta blocks consist of one or more lines of `Key: Value\n`
  if ( ! block.match( /^(?:\w+:.*\n)*\w+:.*$/ ) ) return undefined;

  // make an attribute node if it doesn't exist
  if ( !extract_attr( this.tree ) ) {
    this.tree.splice( 1, 0, {} );
  }

  var pairs = block.split( /\n/ );
  for ( p in pairs ) {
    var m = pairs[ p ].match( /(\w+):\s*(.*)$/ ),
        key = m[ 1 ].toLowerCase(),
        value = m[ 2 ];

    this.tree[ 1 ][ key ] = value;
  }

  // document_meta produces no content!
  return [];
};

Markdown.dialects.Maruku.block.block_meta = function block_meta( block, next ) {
  // check if the last line of the block is an meta hash
  var m = block.match( /(^|\n) {0,3}\{:\s*((?:\\\}|[^\}])*)\s*\}$/ );
  if ( !m ) return undefined;

  // process the meta hash
  var attr = this.dialect.processMetaHash( m[ 2 ] );

  var hash;

  // if we matched ^ then we need to apply meta to the previous block
  if ( m[ 1 ] === "" ) {
    var node = this.tree[ this.tree.length - 1 ];
    hash = extract_attr( node );

    // if the node is a string (rather than JsonML), bail
    if ( typeof node === "string" ) return undefined;

    // create the attribute hash if it doesn't exist
    if ( !hash ) {
      hash = {};
      node.splice( 1, 0, hash );
    }

    // add the attributes in
    for ( a in attr ) {
      hash[ a ] = attr[ a ];
    }

    // return nothing so the meta hash is removed
    return [];
  }

  // pull the meta hash off the block and process what's left
  var b = block.replace( /\n.*$/, "" ),
      result = this.processBlock( b, [] );

  // get or make the attributes hash
  hash = extract_attr( result[ 0 ] );
  if ( !hash ) {
    hash = {};
    result[ 0 ].splice( 1, 0, hash );
  }

  // attach the attributes to the block
  for ( a in attr ) {
    hash[ a ] = attr[ a ];
  }

  return result;
};

Markdown.dialects.Maruku.block.definition_list = function definition_list( block, next ) {
  // one or more terms followed by one or more definitions, in a single block
  var tight = /^((?:[^\s:].*\n)+):\s+([\s\S]+)$/,
      list = [ "dl" ],
      i;

  // see if we're dealing with a tight or loose block
  if ( ( m = block.match( tight ) ) ) {
    // pull subsequent tight DL blocks out of `next`
    var blocks = [ block ];
    while ( next.length && tight.exec( next[ 0 ] ) ) {
      blocks.push( next.shift() );
    }

    for ( var b = 0; b < blocks.length; ++b ) {
      var m = blocks[ b ].match( tight ),
          terms = m[ 1 ].replace( /\n$/, "" ).split( /\n/ ),
          defns = m[ 2 ].split( /\n:\s+/ );

      // print( uneval( m ) );

      for ( i = 0; i < terms.length; ++i ) {
        list.push( [ "dt", terms[ i ] ] );
      }

      for ( i = 0; i < defns.length; ++i ) {
        // run inline processing over the definition
        list.push( [ "dd" ].concat( this.processInline( defns[ i ].replace( /(\n)\s+/, "$1" ) ) ) );
      }
    }
  }
  else {
    return undefined;
  }

  return [ list ];
};

Markdown.dialects.Maruku.inline[ "{:" ] = function inline_meta( text, matches, out ) {
  if ( !out.length ) {
    return [ 2, "{:" ];
  }

  // get the preceeding element
  var before = out[ out.length - 1 ];

  if ( typeof before === "string" ) {
    return [ 2, "{:" ];
  }

  // match a meta hash
  var m = text.match( /^\{:\s*((?:\\\}|[^\}])*)\s*\}/ );

  // no match, false alarm
  if ( !m ) {
    return [ 2, "{:" ];
  }

  // attach the attributes to the preceeding element
  var meta = this.dialect.processMetaHash( m[ 1 ] ),
      attr = extract_attr( before );

  if ( !attr ) {
    attr = {};
    before.splice( 1, 0, attr );
  }

  for ( var k in meta ) {
    attr[ k ] = meta[ k ];
  }

  // cut out the string and replace it with nothing
  return [ m[ 0 ].length, "" ];
};

Markdown.buildBlockOrder ( Markdown.dialects.Maruku.block );
Markdown.buildInlinePatterns( Markdown.dialects.Maruku.inline );

var isArray = Array.isArray || function(obj) {
  return Object.prototype.toString.call(obj) == '[object Array]';
};

var forEach;
// Don't mess with Array.prototype. Its not friendly
if ( Array.prototype.forEach ) {
  forEach = function( arr, cb, thisp ) {
    return arr.forEach( cb, thisp );
  };
}
else {
  forEach = function(arr, cb, thisp) {
    for (var i = 0; i < arr.length; i++) {
      cb.call(thisp || arr, arr[i], i, arr);
    }
  }
}

function extract_attr( jsonml ) {
  return isArray(jsonml)
      && jsonml.length > 1
      && typeof jsonml[ 1 ] === "object"
      && !( isArray(jsonml[ 1 ]) )
      ? jsonml[ 1 ]
      : undefined;
}



/**
 *  renderJsonML( jsonml[, options] ) -> String
 *  - jsonml (Array): JsonML array to render to XML
 *  - options (Object): options
 *
 *  Converts the given JsonML into well-formed XML.
 *
 *  The options currently understood are:
 *
 *  - root (Boolean): wether or not the root node should be included in the
 *    output, or just its children. The default `false` is to not include the
 *    root itself.
 */
expose.renderJsonML = function( jsonml, options ) {
  options = options || {};
  // include the root element in the rendered output?
  options.root = options.root || false;

  var content = [];

  if ( options.root ) {
    content.push( render_tree( jsonml ) );
  }
  else {
    jsonml.shift(); // get rid of the tag
    if ( jsonml.length && typeof jsonml[ 0 ] === "object" && !( jsonml[ 0 ] instanceof Array ) ) {
      jsonml.shift(); // get rid of the attributes
    }

    while ( jsonml.length ) {
      content.push( render_tree( jsonml.shift() ) );
    }
  }

  return content.join( "\n\n" );
};

function escapeHTML( text ) {
  return text.replace( /&/g, "&amp;" )
             .replace( /</g, "&lt;" )
             .replace( />/g, "&gt;" )
             .replace( /"/g, "&quot;" )
             .replace( /'/g, "&#39;" );
}

function render_tree( jsonml ) {
  // basic case
  if ( typeof jsonml === "string" ) {
    return escapeHTML( jsonml );
  }

  var tag = jsonml.shift(),
      attributes = {},
      content = [];

  if ( jsonml.length && typeof jsonml[ 0 ] === "object" && !( jsonml[ 0 ] instanceof Array ) ) {
    attributes = jsonml.shift();
  }

  while ( jsonml.length ) {
    content.push( arguments.callee( jsonml.shift() ) );
  }

  var tag_attrs = "";
  for ( var a in attributes ) {
    tag_attrs += " " + a + '="' + escapeHTML( attributes[ a ] ) + '"';
  }

  // be careful about adding whitespace here for inline elements
  if ( tag == "img" || tag == "br" || tag == "hr" ) {
    return "<"+ tag + tag_attrs + "/>";
  }
  else {
    return "<"+ tag + tag_attrs + ">" + content.join( "" ) + "</" + tag + ">";
  }
}

function convert_tree_to_html( tree, references, options ) {
  var i;
  options = options || {};

  // shallow clone
  var jsonml = tree.slice( 0 );

  if (typeof options.preprocessTreeNode === "function") {
      jsonml = options.preprocessTreeNode(jsonml, references);
  }

  // Clone attributes if they exist
  var attrs = extract_attr( jsonml );
  if ( attrs ) {
    jsonml[ 1 ] = {};
    for ( i in attrs ) {
      jsonml[ 1 ][ i ] = attrs[ i ];
    }
    attrs = jsonml[ 1 ];
  }

  // basic case
  if ( typeof jsonml === "string" ) {
    return jsonml;
  }

  // convert this node
  switch ( jsonml[ 0 ] ) {
    case "header":
      jsonml[ 0 ] = "h" + jsonml[ 1 ].level;
      delete jsonml[ 1 ].level;
      break;
    case "bulletlist":
      jsonml[ 0 ] = "ul";
      break;
    case "numberlist":
      jsonml[ 0 ] = "ol";
      break;
    case "listitem":
      jsonml[ 0 ] = "li";
      break;
    case "para":
      jsonml[ 0 ] = "p";
      break;
    case "markdown":
      jsonml[ 0 ] = "html";
      if ( attrs ) delete attrs.references;
      break;
    case "code_block":
      jsonml[ 0 ] = "pre";
      i = attrs ? 2 : 1;
      var code = [ "code" ];
      code.push.apply( code, jsonml.splice( i ) );
      jsonml[ i ] = code;
      break;
    case "inlinecode":
      jsonml[ 0 ] = "code";
      break;
    case "img":
      jsonml[ 1 ].src = jsonml[ 1 ].href;
      delete jsonml[ 1 ].href;
      break;
    case "linebreak":
      jsonml[ 0 ] = "br";
    break;
    case "link":
      jsonml[ 0 ] = "a";
      break;
    case "link_ref":
      jsonml[ 0 ] = "a";

      // grab this ref and clean up the attribute node
      var ref = references[ attrs.ref ];

      // if the reference exists, make the link
      if ( ref ) {
        delete attrs.ref;

        // add in the href and title, if present
        attrs.href = ref.href;
        if ( ref.title ) {
          attrs.title = ref.title;
        }

        // get rid of the unneeded original text
        delete attrs.original;
      }
      // the reference doesn't exist, so revert to plain text
      else {
        return attrs.original;
      }
      break;
    case "img_ref":
      jsonml[ 0 ] = "img";

      // grab this ref and clean up the attribute node
      var ref = references[ attrs.ref ];

      // if the reference exists, make the link
      if ( ref ) {
        delete attrs.ref;

        // add in the href and title, if present
        attrs.src = ref.href;
        if ( ref.title ) {
          attrs.title = ref.title;
        }

        // get rid of the unneeded original text
        delete attrs.original;
      }
      // the reference doesn't exist, so revert to plain text
      else {
        return attrs.original;
      }
      break;
  }

  // convert all the children
  i = 1;

  // deal with the attribute node, if it exists
  if ( attrs ) {
    // if there are keys, skip over it
    for ( var key in jsonml[ 1 ] ) {
      i = 2;
    }
    // if there aren't, remove it
    if ( i === 1 ) {
      jsonml.splice( i, 1 );
    }
  }

  for ( ; i < jsonml.length; ++i ) {
    jsonml[ i ] = arguments.callee( jsonml[ i ], references, options );
  }

  return jsonml;
}


// merges adjacent text nodes into a single node
function merge_text_nodes( jsonml ) {
  // skip the tag name and attribute hash
  var i = extract_attr( jsonml ) ? 2 : 1;

  while ( i < jsonml.length ) {
    // if it's a string check the next item too
    if ( typeof jsonml[ i ] === "string" ) {
      if ( i + 1 < jsonml.length && typeof jsonml[ i + 1 ] === "string" ) {
        // merge the second string into the first and remove it
        jsonml[ i ] += jsonml.splice( i + 1, 1 )[ 0 ];
      }
      else {
        ++i;
      }
    }
    // if it's not a string recurse
    else {
      arguments.callee( jsonml[ i ] );
      ++i;
    }
  }
}

} )( (function() {
  if ( typeof exports === "undefined" ) {
    window.markdown = {};
    return window.markdown;
  }
  else {
    return exports;
  }
} )() );

});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("/src/js/models/commandModel.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Errors = require('../util/errors');
var GitCommands = require('../git/commands');
var GitOptionParser = GitCommands.GitOptionParser;

var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;

var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var Command = Backbone.Model.extend({
  defaults: {
    status: 'inqueue',
    rawStr: null,
    result: '',
    createTime: null,

    error: null,
    warnings: null,
    parseWaterfall: new ParseWaterfall(),

    generalArgs: null,
    supportedMap: null,
    options: null,
    method: null

  },

  initialize: function(options) {
    this.initDefaults();
    this.validateAtInit();

    this.on('change:error', this.errorChanged, this);
    // catch errors on init
    if (this.get('error')) {
      this.errorChanged();
    }

    this.parseOrCatch();
  },

  initDefaults: function() {
    // weird things happen with defaults if you dont
    // make new objects
    this.set('generalArgs', []);
    this.set('supportedMap', {});
    this.set('warnings', []);
  },

  validateAtInit: function() {
    if (this.get('rawStr') === null) {
      throw new Error('Give me a string!');
    }
    if (!this.get('createTime')) {
      this.set('createTime', new Date().toString());
    }
  },

  setResult: function(msg) {
    this.set('result', msg);
  },

  finishWith: function(deferred) {
    this.set('status', 'finished');
    deferred.resolve();
  },

  addWarning: function(msg) {
    this.get('warnings').push(msg);
    // change numWarnings so the change event fires. This is bizarre -- Backbone can't
    // detect if an array changes, so adding an element does nothing
    this.set('numWarnings', this.get('numWarnings') ? this.get('numWarnings') + 1 : 1);
  },

  getFormattedWarnings: function() {
    if (!this.get('warnings').length) {
      return '';
    }
    var i = '<i class="icon-exclamation-sign"></i>';
    return '<p>' + i + this.get('warnings').join('</p><p>' + i) + '</p>';
  },

  parseOrCatch: function() {
    this.expandShortcuts(this.get('rawStr'));
    try {
      this.processInstants();
    } catch (err) {
      Errors.filterError(err);
      // errorChanged() will handle status and all of that
      this.set('error', err);
      return;
    }

    if (this.parseAll()) {
      // something in our parse waterfall succeeded
      return;
    }

    // if we reach here, this command is not supported :-/
    this.set('error', new CommandProcessError({
        msg: 'The command "' + this.get('rawStr') + '" isn\'t supported, sorry!'
      })
    );
  },

  errorChanged: function() {
    var err = this.get('error');
    if (err instanceof CommandProcessError ||
        err instanceof GitError) {
      this.set('status', 'error');
    } else if (err instanceof CommandResult) {
      this.set('status', 'finished');
    } else if (err instanceof Warning) {
      this.set('status', 'warning');
    }
    this.formatError();
  },

  formatError: function() {
    this.set('result', this.get('error').toResult());
  },

  expandShortcuts: function(str) {
    str = this.get('parseWaterfall').expandAllShortcuts(str);
    this.set('rawStr', str);
  },

  processInstants: function() {
    var str = this.get('rawStr');
    // first if the string is empty, they just want a blank line
    if (!str.length) {
      throw new CommandResult({msg: ""});
    }

    // then instant commands that will throw
    this.get('parseWaterfall').processAllInstants(str);
  },

  parseAll: function() {
    var str = this.get('rawStr');
    var results = this.get('parseWaterfall').parseAll(str);

    if (!results) {
      // nothing parsed successfully
      return false;
    }

    _.each(results.toSet, function(obj, key) {
      // data comes back from the parsing functions like
      // options (etc) that need to be set
      this.set(key, obj);
    }, this);
    return true;
  }
});

// command entry is for the commandview
var CommandEntry = Backbone.Model.extend({
  defaults: {
    text: ''
  }
});

exports.CommandEntry = CommandEntry;
exports.Command = Command;

});

require.define("/src/js/git/commands.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var Errors = require('../util/errors');
var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var shortcutMap = {
  'git commit': /^gc($|\s)/,
  'git add': /^ga($|\s)/,
  'git checkout': /^go($|\s)/,
  'git rebase': /^gr($|\s)/,
  'git branch': /^gb($|\s)/,
  'git status': /^gs($|\s)/,
  'git help': /^git$/
};

var instantCommands = [
  [/^git help($|\s)/, function() {
    var lines = [
      'Git Version PCOTTLE.1.0',
      '<br/>',
      'Usage:',
      _.escape('\t git <command> [<args>]'),
      '<br/>',
      'Supported commands:',
      '<br/>'
    ];
    var commands = GitOptionParser.prototype.getMasterOptionMap();

    // build up a nice display of what we support
    _.each(commands, function(commandOptions, command) {
      lines.push('git ' + command);
      _.each(commandOptions, function(vals, optionName) {
        lines.push('\t ' + optionName);
      }, this);
    }, this);

    // format and throw
    var msg = lines.join('\n');
    msg = msg.replace(/\t/g, '&nbsp;&nbsp;&nbsp;');
    throw new CommandResult({
      msg: msg
    });
  }]
];

var regexMap = {
  // ($|\s) means that we either have to end the string
  // after the command or there needs to be a space for options
  'git commit': /^git commit($|\s)/,
  'git add': /^git add($|\s)/,
  'git checkout': /^git checkout($|\s)/,
  'git rebase': /^git rebase($|\s)/,
  'git reset': /^git reset($|\s)/,
  'git branch': /^git branch($|\s)/,
  'git revert': /^git revert($|\s)/,
  'git log': /^git log($|\s)/,
  'git merge': /^git merge($|\s)/,
  'git show': /^git show($|\s)/,
  'git status': /^git status($|\s)/,
  'git cherry-pick': /^git cherry-pick($|\s)/
};

var parse = function(str) {
  var method;
  var options;

  // see if we support this particular command
  _.each(regexMap, function(regex, thisMethod) {
    if (regex.exec(str)) {
      options = str.slice(thisMethod.length + 1);
      method = thisMethod.slice('git '.length);
    }
  });

  if (!method) {
    return false;
  }

  // we support this command!
  // parse off the options and assemble the map / general args
  var parsedOptions = new GitOptionParser(method, options);
  return {
    toSet: {
      generalArgs: parsedOptions.generalArgs,
      supportedMap: parsedOptions.supportedMap,
      method: method,
      options: options,
      eventName: 'processGitCommand'
    }
  };
};

/**
 * GitOptionParser
 */
function GitOptionParser(method, options) {
  this.method = method;
  this.rawOptions = options;

  this.supportedMap = this.getMasterOptionMap()[method];
  if (this.supportedMap === undefined) {
    throw new Error('No option map for ' + method);
  }

  this.generalArgs = [];
  this.explodeAndSet();
}

GitOptionParser.prototype.getMasterOptionMap = function() {
  // here a value of false means that we support it, even if its just a
  // pass-through option. If the value is not here (aka will be undefined
  // when accessed), we do not support it.
  return {
    commit: {
      '--amend': false,
      '-a': false, // warning
      '-am': false, // warning
      '-m': false
    },
    status: {},
    log: {},
    add: {},
    'cherry-pick': {},
    branch: {
      '-d': false,
      '-D': false,
      '-f': false,
      '--contains': false
    },
    checkout: {
      '-b': false,
      '-B': false,
      '-': false
    },
    reset: {
      '--hard': false,
      '--soft': false // this will raise an error but we catch it in gitEngine
    },
    merge: {},
    rebase: {
      '-i': false // the mother of all options
    },
    revert: {},
    show: {}
  };
};

GitOptionParser.prototype.explodeAndSet = function() {
  // split on spaces, except when inside quotes

  var exploded = this.rawOptions.match(/('.*?'|".*?"|\S+)/g) || [];

  for (var i = 0; i < exploded.length; i++) {
    var part = exploded[i];
    if (part.slice(0,1) == '-') {
      // it's an option, check supportedMap
      if (this.supportedMap[part] === undefined) {
        throw new CommandProcessError({
          msg: 'The option "' + part + '" is not supported'
        });
      }

      // go through and include all the next args until we hit another option or the end
      var optionArgs = [];
      var next = i + 1;
      while (next < exploded.length && exploded[next].slice(0,1) != '-') {
        optionArgs.push(exploded[next]);
        next += 1;
      }
      i = next - 1;

      // **phew** we are done grabbing those. theseArgs is truthy even with an empty array
      this.supportedMap[part] = optionArgs;
    } else {
      // must be a general arg
      this.generalArgs.push(part);
    }
  }
};

exports.shortcutMap = shortcutMap;
exports.instantCommands = instantCommands;
exports.parse = parse;
exports.regexMap = regexMap;


});

require.define("/src/js/level/parseWaterfall.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var GitCommands = require('../git/commands');
var SandboxCommands = require('../level/SandboxCommands');

// more or less a static class
var ParseWaterfall = function(options) {
  options = options || {};
  this.options = options;
  this.shortcutWaterfall = options.shortcutWaterfall || [
    GitCommands.shortcutMap
  ];

  this.instantWaterfall = options.instantWaterfall || [
    GitCommands.instantCommands,
    SandboxCommands.instantCommands
  ];

  // defer the parse waterfall until later...
};

ParseWaterfall.prototype.initParseWaterfall = function() {
  // check for node when testing
  if (!require('../util').isBrowser()) {
    this.parseWaterfall = [GitCommands.parse];
    return;
  }

  // by deferring the initialization here, we dont require()
  // level too early (which barfs our init)
  this.parseWaterfall = this.options.parseWaterfall || [
    GitCommands.parse,
    SandboxCommands.parse,
    SandboxCommands.getOptimisticLevelParse(),
    SandboxCommands.getOptimisticLevelBuilderParse()
  ];
};

ParseWaterfall.prototype.clone = function() {
  return new ParseWaterfall({
    shortcutWaterfall: this.shortcutWaterfall.slice(),
    instantWaterfall: this.instantWaterfall.slice(),
    parseWaterfall: this.parseWaterfall.slice()
  });
};

ParseWaterfall.prototype.getWaterfallMap = function() {
  if (!this.parseWaterfall) {
    this.initParseWaterfall();
  }
  return {
    shortcutWaterfall: this.shortcutWaterfall,
    instantWaterfall: this.instantWaterfall,
    parseWaterfall: this.parseWaterfall
  };
};

ParseWaterfall.prototype.addFirst = function(which, value) {
  if (!which || !value) {
    throw new Error('need to know which!!!');
  }
  this.getWaterfallMap()[which].unshift(value);
};

ParseWaterfall.prototype.addLast = function(which, value) {
  this.getWaterfallMap()[which].push(value);
};

ParseWaterfall.prototype.expandAllShortcuts = function(commandStr) {
  _.each(this.shortcutWaterfall, function(shortcutMap) {
    commandStr = this.expandShortcut(commandStr, shortcutMap);
  }, this);
  return commandStr;
};

ParseWaterfall.prototype.expandShortcut = function(commandStr, shortcutMap) {
  _.each(shortcutMap, function(regex, method) {
    var results = regex.exec(commandStr);
    if (results) {
      commandStr = method + ' ' + commandStr.slice(results[0].length);
    }
  });
  return commandStr;
};

ParseWaterfall.prototype.processAllInstants = function(commandStr) {
  _.each(this.instantWaterfall, function(instantCommands) {
    this.processInstant(commandStr, instantCommands);
  }, this);
};

ParseWaterfall.prototype.processInstant = function(commandStr, instantCommands) {
  _.each(instantCommands, function(tuple) {
    var regex = tuple[0];
    var results = regex.exec(commandStr);
    if (results) {
      // this will throw a result because it's an instant
      tuple[1](results);
    }
  });
};

ParseWaterfall.prototype.parseAll = function(commandStr) {
  if (!this.parseWaterfall) {
    this.initParseWaterfall();
  }

  var toReturn = false;
  _.each(this.parseWaterfall, function(parseFunc) {
    var results = parseFunc(commandStr);
    if (results) {
      toReturn = results;
    }
  }, this);

  return toReturn;
};

exports.ParseWaterfall = ParseWaterfall;


});

require.define("/src/js/level/SandboxCommands.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var util = require('../util');

var Errors = require('../util/errors');
var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var instantCommands = [
  [/^ls/, function() {
    throw new CommandResult({
      msg: "DontWorryAboutFilesInThisDemo.txt"
    });
  }],
  [/^cd/, function() {
    throw new CommandResult({
      msg: "Directory Changed to '/directories/dont/matter/in/this/demo'"
    });
  }],
  [/^refresh$/, function() {
    var events = require('../app').getEvents();

    events.trigger('refreshTree');
    throw new CommandResult({
      msg: "Refreshing tree..."
    });
  }],
  [/^rollup (\d+)$/, function(bits) {
    var events = require('../app').getEvents();

    // go roll up these commands by joining them with semicolons
    events.trigger('rollupCommands', bits[1]);
    throw new CommandResult({
      msg: 'Commands combined!'
    });
  }],
  [/^echo "(.*?)"$|^echo (.*?)$/, function(bits) {
    var msg = bits[1] || bits[2];
    throw new CommandResult({
      msg: msg
    });
  }]
];

var regexMap = {
  'reset solved': /^reset solved($|\s)/,
  'help': /^help( general)?$|^\?$/,
  'reset': /^reset$/,
  'delay': /^delay (\d+)$/,
  'clear': /^clear($|\s)/,
  'exit level': /^exit level($|\s)/,
  'sandbox': /^sandbox($|\s)/,
  'level': /^level\s?([a-zA-Z0-9]*)/,
  'levels': /^levels($|\s)/,
  'mobileAlert': /^mobile alert($|\s)/,
  'build level': /^build level($|\s)/,
  'export tree': /^export tree$/,
  'import tree': /^import tree$/,
  'import level': /^import level$/
};

exports.instantCommands = instantCommands;
exports.parse = util.genParseCommand(regexMap, 'processSandboxCommand');

// optimistically parse some level and level builder commands; we do this
// so you can enter things like "level intro1; show goal" and not
// have it barf. when the
// command fires the event, it will check if there is a listener and if not throw
// an error

// note: these are getters / setters because the require kills us
exports.getOptimisticLevelParse = function() {
  return util.genParseCommand(
    require('../level').regexMap,
    'processLevelCommand'
  );
};

exports.getOptimisticLevelBuilderParse = function() {
  return util.genParseCommand(
    require('../level/builder').regexMap,
    'processLevelBuilderCommand'
  );
};

});

require.define("/src/js/level/builder.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var Q = require('q');

var util = require('../util');
var Main = require('../app');
var Errors = require('../util/errors');

var Visualization = require('../visuals/visualization').Visualization;
var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;
var Level = require('../level').Level;

var Command = require('../models/commandModel').Command;
var GitShim = require('../git/gitShim').GitShim;

var MultiView = require('../views/multiView').MultiView;

var CanvasTerminalHolder = require('../views').CanvasTerminalHolder;
var ConfirmCancelTerminal = require('../views').ConfirmCancelTerminal;
var NextLevelConfirm = require('../views').NextLevelConfirm;
var LevelToolbar = require('../views').LevelToolbar;

var MarkdownPresenter = require('../views/builderViews').MarkdownPresenter;
var MultiViewBuilder = require('../views/builderViews').MultiViewBuilder;
var MarkdownGrabber = require('../views/builderViews').MarkdownGrabber;

var regexMap = {
  'define goal': /^define goal$/,
  'define name': /^define name$/,
  'help builder': /^help builder$/,
  'define start': /^define start$/,
  'edit dialog': /^edit dialog$/,
  'show start': /^show start$/,
  'hide start': /^hide start$/,
  'define hint': /^define hint$/,
  'finish': /^finish$/
};

var parse = util.genParseCommand(regexMap, 'processLevelBuilderCommand');

var LevelBuilder = Level.extend({
  initialize: function(options) {
    options = options || {};
    options.level = options.level || {};

    options.level.startDialog = {
      childViews: require('../dialogs/levelBuilder').dialog
    };
    LevelBuilder.__super__.initialize.apply(this, [options]);

    this.initStartVisualization();
    this.startDialog = undefined;
    this.definedGoal = false;

    // we wont be using this stuff, and its to delete to ensure we overwrite all functions that
    // include that functionality
    delete this.treeCompare;
    delete this.solved;
  },

  initName: function() {
    this.levelToolbar = new LevelToolbar({
      name: 'Level Builder'
    });
  },

  initGoalData: function() {
    // add some default behavior in the beginning
    this.level.goalTreeString = '{"branches":{"master":{"target":"C1","id":"master"},"makeLevel":{"target":"C2","id":"makeLevel"}},"commits":{"C0":{"parents":[],"id":"C0","rootCommit":true},"C1":{"parents":["C0"],"id":"C1"},"C2":{"parents":["C1"],"id":"C2"}},"HEAD":{"target":"makeLevel","id":"HEAD"}}';
    this.level.solutionCommand = 'git checkout -b makeLevel; git commit';
    LevelBuilder.__super__.initGoalData.apply(this, arguments);
  },

  initStartVisualization: function() {
    this.startCanvasHolder = new CanvasTerminalHolder({
      additionalClass: 'startTree',
      text: 'You can hide this window with "hide start"'
    });

    this.startVis = new Visualization({
      el: this.startCanvasHolder.getCanvasLocation(),
      containerElement: this.startCanvasHolder.getCanvasLocation(),
      treeString: this.level.startTree,
      noKeyboardInput: true,
      noClick: true
    });
  },

  startDie: function() {
    this.startCanvasHolder.die();
    this.startVis.die();
  },

  startOffCommand: function() {
    Main.getEventBaton().trigger(
      'commandSubmitted',
      'echo "Get Building!!"'
    );
  },

  initParseWaterfall: function(options) {
    LevelBuilder.__super__.initParseWaterfall.apply(this, [options]);

    this.parseWaterfall.addFirst(
      'parseWaterfall',
      parse
    );
    this.parseWaterfall.addFirst(
      'instantWaterfall',
      this.getInstantCommands()
    );
  },

  buildLevel: function(command, deferred) {
    this.exitLevel();

    setTimeout(function() {
      Main.getSandbox().buildLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
  },

  getInstantCommands: function() {
    return [
      [/^help$|^\?$/, function() {
        throw new Errors.CommandResult({
          msg: 'You are in a level builder, so multiple forms of ' +
               'help are available. Please select either ' +
               '"help general" or "help builder"'
        });
      }]
    ];
  },

  takeControl: function() {
    Main.getEventBaton().stealBaton('processLevelBuilderCommand', this.processLevelBuilderCommand, this);

    LevelBuilder.__super__.takeControl.apply(this);
  },

  releaseControl: function() {
    Main.getEventBaton().releaseBaton('processLevelBuilderCommand', this.processLevelBuilderCommand, this);

    LevelBuilder.__super__.releaseControl.apply(this);
  },

  showGoal: function() {
    this.startCanvasHolder.slideOut();
    LevelBuilder.__super__.showGoal.apply(this, arguments);
  },

  showStart: function(command, deferred) {
    this.goalCanvasHolder.slideOut();
    this.startCanvasHolder.slideIn();

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.startCanvasHolder.getAnimationTime());
  },

  resetSolution: function() {
    this.gitCommandsIssued = [];
    this.level.solutionCommand = undefined;
  },

  hideStart: function(command, deferred) {
    this.startCanvasHolder.slideOut();

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.startCanvasHolder.getAnimationTime());
  },

  defineStart: function(command, deferred) {
    this.startDie();

    command.addWarning(
      'Defining start point... solution and goal will be overwritten if they were defined earlier'
    );
    this.resetSolution();

    this.level.startTree = this.mainVis.gitEngine.printTree();
    this.mainVis.resetFromThisTreeNow(this.level.startTree);

    this.initStartVisualization();

    this.showStart(command, deferred);
  },

  defineGoal: function(command, deferred) {
    this.goalDie();

    if (!this.gitCommandsIssued.length) {
      command.set('error', new Errors.GitError({
        msg: 'Your solution is empty!! something is amiss'
      }));
      deferred.resolve();
      return;
    }

    this.definedGoal = true;
    this.level.solutionCommand = this.gitCommandsIssued.join(';');
    this.level.goalTreeString = this.mainVis.gitEngine.printTree();
    this.initGoalVisualization();

    this.showGoal(command, deferred);
  },

  defineName: function(command, deferred) {
    this.level.name = prompt('Enter the name for the level');
    if (command) { command.finishWith(deferred); }
  },

  defineHint: function(command, deferred) {
    this.level.hint = prompt('Enter a hint! Or blank if you dont want one');
    if (command) { command.finishWith(deferred); }
  },

  editDialog: function(command, deferred) {
    var whenDoneEditing = Q.defer();
    this.currentBuilder = new MultiViewBuilder({
      multiViewJSON: this.startDialog,
      deferred: whenDoneEditing
    });
    whenDoneEditing.promise
    .then(_.bind(function(levelObj) {
      this.startDialog = levelObj;
    }, this))
    .fail(function() {
      // nothing to do, they dont want to edit it apparently
    })
    .done(function() {
      if (command) {
        command.finishWith(deferred);
      } else {
        deferred.resolve();
      }
    });
  },

  finish: function(command, deferred) {
    if (!this.gitCommandsIssued.length || !this.definedGoal) {
      command.set('error', new Errors.GitError({
        msg: 'Your solution is empty or goal is undefined!'
      }));
      deferred.resolve();
      return;
    }

    while (!this.level.name) {
      this.defineName();
    }

    var masterDeferred = Q.defer();
    var chain = masterDeferred.promise;

    if (this.level.hint === undefined) {
      var askForHintDeferred = Q.defer();
      chain = chain.then(function() {
        return askForHintDeferred.promise;
      });

      // ask for a hint if there is none
      var askForHintView = new ConfirmCancelTerminal({
        markdowns: [
          'You have not specified a hint, would you like to add one?'
        ]
      });
      askForHintView.getPromise()
      .then(_.bind(this.defineHint, this))
      .fail(_.bind(function() {
        this.level.hint = '';
      }, this))
      .done(function() {
        askForHintDeferred.resolve();
      });
    }

    if (this.startDialog === undefined) {
      var askForStartDeferred = Q.defer();
      chain = chain.then(function() {
        return askForStartDeferred.promise;
      });

      var askForStartView = new ConfirmCancelTerminal({
        markdowns: [
          'You have not specified a start dialog, would you like to add one?'
        ]
      });
      askForStartView.getPromise()
      .then(_.bind(function() {
        // oh boy this is complex
        var whenEditedDialog = Q.defer();
        // the undefined here is the command that doesnt need resolving just yet...
        this.editDialog(undefined, whenEditedDialog);
        return whenEditedDialog.promise;
      }, this))
      .fail(function() {
        // if they dont want to edit the start dialog, do nothing
      })
      .done(function() {
        askForStartDeferred.resolve();
      });
    }

    chain = chain.done(_.bind(function() {
      // ok great! lets just give them the goods
      new MarkdownPresenter({
        fillerText: JSON.stringify(this.getExportObj(), null, 2),
        previewText: 'Here is the JSON for this level! Share it with someone or send it to me on Github!'
      });
      command.finishWith(deferred);
    }, this));

    masterDeferred.resolve();
  },

  getExportObj: function() {
    var compiledLevel = _.extend(
      {},
      this.level
    );
    // the start dialog now is just our help intro thing
    delete compiledLevel.startDialog;
    if (this.startDialog) {
      compiledLevel.startDialog  = this.startDialog;
    }
    return compiledLevel;
  },

  processLevelBuilderCommand: function(command, deferred) {
    var methodMap = {
      'define goal': this.defineGoal,
      'define start': this.defineStart,
      'show start': this.showStart,
      'hide start': this.hideStart,
      'finish': this.finish,
      'define hint': this.defineHint,
      'edit dialog': this.editDialog,
      'help builder': LevelBuilder.__super__.startDialog
    };
    if (!methodMap[command.get('method')]) {
      throw new Error('woah we dont support that method yet');
    }

    methodMap[command.get('method')].apply(this, arguments);
  },

  afterCommandDefer: function(defer, command) {
    // we dont need to compare against the goal anymore
    defer.resolve();
  },

  die: function() {
    this.startDie();

    LevelBuilder.__super__.die.apply(this, arguments);

    delete this.startVis;
    delete this.startCanvasHolder;
  }
});

exports.LevelBuilder = LevelBuilder;
exports.regexMap = regexMap;

});

require.define("/src/js/git/gitShim.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');

var Main = require('../app');
var MultiView = require('../views/multiView').MultiView;

function GitShim(options) {
  options = options || {};

  // these variables are just functions called before / after for
  // simple things (like incrementing a counter)
  this.beforeCB = options.beforeCB || function() {};
  this.afterCB = options.afterCB || function() {};

  // these guys handle an optional async process before the git
  // command executes or afterwards. If there is none,
  // it just resolves the deferred immediately
  var resolveImmediately = function(deferred) {
    deferred.resolve();
  };
  this.beforeDeferHandler = options.beforeDeferHandler || resolveImmediately;
  this.afterDeferHandler = options.afterDeferHandler || resolveImmediately;
  this.eventBaton = options.eventBaton || Main.getEventBaton();
}

GitShim.prototype.insertShim = function() {
  this.eventBaton.stealBaton('processGitCommand', this.processGitCommand, this);
};

GitShim.prototype.removeShim = function() {
  this.eventBaton.releaseBaton('processGitCommand', this.processGitCommand, this);
};

GitShim.prototype.processGitCommand = function(command, deferred) {
  this.beforeCB(command);

  // ok we make a NEW deferred that will, upon resolution,
  // call our afterGitCommandProcessed. This inserts the 'after' shim
  // functionality. we give this new deferred to the eventBaton handler
  var newDeferred = Q.defer();
  newDeferred.promise
  .then(_.bind(function() {
    // give this method the original defer so it can resolve it
    this.afterGitCommandProcessed(command, deferred);
  }, this))
  .done();

  // now our shim owner might want to launch some kind of deferred beforehand, like
  // a modal or something. in order to do this, we need to defer the passing
  // of the event baton backwards, and either resolve that promise immediately or
  // give it to our shim owner.
  var passBaton = _.bind(function() {
    // punt to the previous listener
    this.eventBaton.passBatonBack('processGitCommand', this.processGitCommand, this, [command, newDeferred]);
  }, this);

  var beforeDefer = Q.defer();
  beforeDefer.promise
  .then(passBaton)
  .done();

  // if we didnt receive a defer handler in the options, this just
  // resolves immediately
  this.beforeDeferHandler(beforeDefer, command);
};

GitShim.prototype.afterGitCommandProcessed = function(command, deferred) {
  this.afterCB(command);

  // again we can't just resolve this deferred right away... our shim owner might
  // want to insert some promise functionality before that happens. so again
  // we make a defer
  var afterDefer = Q.defer();
  afterDefer.promise
  .then(function() {
    deferred.resolve();
  })
  .done();

  this.afterDeferHandler(afterDefer, command);
};

exports.GitShim = GitShim;


});

require.define("/src/js/views/multiView.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;
var ConfirmCancelView = require('../views').ConfirmCancelView;
var LeftRightView = require('../views').LeftRightView;
var ModalAlert = require('../views').ModalAlert;
var GitDemonstrationView = require('../views/gitDemonstrationView').GitDemonstrationView;

var BuilderViews = require('../views/builderViews');
var MarkdownPresenter = BuilderViews.MarkdownPresenter;

var KeyboardListener = require('../util/keyboard').KeyboardListener;
var GitError = require('../util/errors').GitError;

var MultiView = Backbone.View.extend({
  tagName: 'div',
  className: 'multiView',
  // ms to debounce the nav functions
  navEventDebounce: 550,
  deathTime: 700,

  // a simple mapping of what childViews we support
  typeToConstructor: {
    ModalAlert: ModalAlert,
    GitDemonstrationView: GitDemonstrationView,
    MarkdownPresenter: MarkdownPresenter
  },

  initialize: function(options) {
    options = options || {};
    this.childViewJSONs = options.childViews || [{
      type: 'ModalAlert',
      options: {
        markdown: 'Woah wtf!!'
      }
     }, {
       type: 'GitDemonstrationView',
       options: {
         command: 'git checkout -b side; git commit; git commit'
       }
     }, {
      type: 'ModalAlert',
      options: {
        markdown: 'Im second'
      }
    }];
    this.deferred = options.deferred || Q.defer();

    this.childViews = [];
    this.currentIndex = 0;

    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('negative', this.getNegFunc(), this);
    this.navEvents.on('positive', this.getPosFunc(), this);
    this.navEvents.on('quit', this.finish, this);

    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        left: 'negative',
        right: 'positive',
        enter: 'positive',
        esc: 'quit'
      }
    });

    this.render();
    if (!options.wait) {
      this.start();
    }
  },

  onWindowFocus: function() {
    // nothing here for now...
    // TODO -- add a cool glow effect?
  },

  getAnimationTime: function() {
    return 700;
  },

  getPromise: function() {
    return this.deferred.promise;
  },

  getPosFunc: function() {
    return _.debounce(_.bind(function() {
      this.navForward();
    }, this), this.navEventDebounce, true);
  },

  getNegFunc: function() {
    return _.debounce(_.bind(function() {
      this.navBackward();
    }, this), this.navEventDebounce, true);
  },

  lock: function() {
    this.locked = true;
  },

  unlock: function() {
    this.locked = false;
  },

  navForward: function() {
    // we need to prevent nav changes when a git demonstration view hasnt finished
    if (this.locked) { return; }
    if (this.currentIndex === this.childViews.length - 1) {
      this.hideViewIndex(this.currentIndex);
      this.finish();
      return;
    }

    this.navIndexChange(1);
  },

  navBackward: function() {
    if (this.currentIndex === 0) {
      return;
    }

    this.navIndexChange(-1);
  },

  navIndexChange: function(delta) {
    this.hideViewIndex(this.currentIndex);
    this.currentIndex += delta;
    this.showViewIndex(this.currentIndex);
  },

  hideViewIndex: function(index) {
    this.childViews[index].hide();
  },

  showViewIndex: function(index) {
    this.childViews[index].show();
  },

  finish: function() {
    // first we stop listening to keyboard and give that back to UI, which
    // other views will take if they need to
    this.keyboardListener.mute();

    _.each(this.childViews, function(childView) {
      childView.die();
    });

    this.deferred.resolve();
  },

  start: function() {
    // steal the window focus baton
    this.showViewIndex(this.currentIndex);
  },

  createChildView: function(viewJSON) {
    var type = viewJSON.type;
    if (!this.typeToConstructor[type]) {
      throw new Error('no constructor for type "' + type + '"');
    }
    var view = new this.typeToConstructor[type](_.extend(
      {},
      viewJSON.options,
      { wait: true }
    ));
    return view;
  },

  addNavToView: function(view, index) {
    var leftRight = new LeftRightView({
      events: this.navEvents,
      // we want the arrows to be on the same level as the content (not
      // beneath), so we go one level up with getDestination()
      destination: view.getDestination(),
      showLeft: (index !== 0),
      lastNav: (index === this.childViewJSONs.length - 1)
    });
    if (view.receiveMetaNav) {
      view.receiveMetaNav(leftRight, this);
    }
  },

  render: function() {
    // go through each and render... show the first
    _.each(this.childViewJSONs, function(childViewJSON, index) {
      var childView = this.createChildView(childViewJSON);
      this.childViews.push(childView);
      this.addNavToView(childView, index);
    }, this);
  }
});

exports.MultiView = MultiView;


});

require.define("/src/js/views/gitDemonstrationView.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var KeyboardListener = require('../util/keyboard').KeyboardListener;
var Command = require('../models/commandModel').Command;

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;

var Visualization = require('../visuals/visualization').Visualization;

var GitDemonstrationView = ContainedBase.extend({
  tagName: 'div',
  className: 'gitDemonstrationView box horizontal',
  template: _.template($('#git-demonstration-view').html()),

  events: {
    'click div.command > p.uiButton': 'positive'
  },

  initialize: function(options) {
    options = options || {};
    this.options = options;
    this.JSON = _.extend(
      {
        beforeMarkdowns: [
          '## Git Commits',
          '',
          'Awesome!'
        ],
        command: 'git commit',
        afterMarkdowns: [
          'Now you have seen it in action',
          '',
          'Go ahead and try the level!'
        ]
      },
      options
    );

    var convert = function(markdowns) {
      return require('markdown').markdown.toHTML(markdowns.join('\n'));
    };

    this.JSON.beforeHTML = convert(this.JSON.beforeMarkdowns);
    this.JSON.afterHTML = convert(this.JSON.afterMarkdowns);

    this.container = new ModalTerminal({
      title: options.title || 'Git Demonstration'
    });
    this.render();
    this.checkScroll();

    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('negative', this.negative, this);
    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        enter: 'positive',
        right: 'positive',
        left: 'negative'
      },
      wait: true
    });

    this.visFinished = false;
    this.initVis();

    if (!options.wait) {
      this.show();
    }
  },

  receiveMetaNav: function(navView, metaContainerView) {
    var _this = this;
    navView.navEvents.on('positive', this.positive, this);
    this.metaContainerView = metaContainerView;
  },

  checkScroll: function() {
    var children = this.$('div.demonstrationText').children();
    var heights = _.map(children, function(child) { return child.clientHeight; });
    var totalHeight = _.reduce(heights, function(a, b) { return a + b; });
    if (totalHeight < this.$('div.demonstrationText').height()) {
      this.$('div.demonstrationText').addClass('noLongText');
    }
  },

  dispatchBeforeCommand: function() {
    if (!this.options.beforeCommand) {
      return;
    }
    // here we just split the command and push them through to the git engine
    util.splitTextCommand(this.options.beforeCommand, function(commandStr) {
      this.mainVis.gitEngine.dispatch(new Command({
        rawStr: commandStr
      }), Q.defer());
    }, this);
    // then harsh refresh
    this.mainVis.gitVisuals.refreshTreeHarsh();
  },

  takeControl: function() {
    this.hasControl = true;
    this.keyboardListener.listen();

    if (this.metaContainerView) { this.metaContainerView.lock(); }
  },

  releaseControl: function() {
    if (!this.hasControl) { return; }
    this.hasControl = false;
    this.keyboardListener.mute();

    if (this.metaContainerView) { this.metaContainerView.unlock(); }
  },

  reset: function() {
    this.mainVis.reset();
    this.demonstrated = false;
    this.$el.toggleClass('demonstrated', false);
    this.$el.toggleClass('demonstrating', false);
  },

  positive: function() {
    if (this.demonstrated || !this.hasControl) {
      // dont do anything if we are demonstrating, and if
      // we receive a meta nav event and we aren't listening,
      // then dont do anything either
      return;
    }
    this.demonstrated = true;
    this.demonstrate();
  },

  demonstrate: function() {
    this.$el.toggleClass('demonstrating', true);

    var whenDone = Q.defer();
    this.dispatchCommand(this.JSON.command, whenDone);
    whenDone.promise.then(_.bind(function() {
      this.$el.toggleClass('demonstrating', false);
      this.$el.toggleClass('demonstrated', true);
      this.releaseControl();
    }, this));
  },

  negative: function(e) {
    if (this.$el.hasClass('demonstrating')) {
      return;
    }
    this.keyboardListener.passEventBack(e);
  },

  dispatchCommand: function(value, whenDone) {
    var commands = [];
    util.splitTextCommand(value, function(commandStr) {
      commands.push(new Command({
        rawStr: commandStr
      }));
    }, this);

    var chainDeferred = Q.defer();
    var chainPromise = chainDeferred.promise;

    _.each(commands, function(command, index) {
      chainPromise = chainPromise.then(_.bind(function() {
        var myDefer = Q.defer();
        this.mainVis.gitEngine.dispatch(command, myDefer);
        return myDefer.promise;
      }, this));
      chainPromise = chainPromise.then(function() {
        return Q.delay(300);
      });
    }, this);

    chainPromise = chainPromise.then(function() {
      whenDone.resolve();
    });

    chainDeferred.resolve();
  },

  tearDown: function() {
    this.mainVis.tearDown();
    GitDemonstrationView.__super__.tearDown.apply(this);
  },

  hide: function() {
    this.releaseControl();
    this.reset();
    if (this.visFinished) {
      this.mainVis.setTreeIndex(-1);
      this.mainVis.setTreeOpacity(0);
    }

    this.shown = false;
    GitDemonstrationView.__super__.hide.apply(this);
  },

  show: function() {
    this.takeControl();
    if (this.visFinished) {
      setTimeout(_.bind(function() {
        if (this.shown) {
          this.mainVis.setTreeIndex(300);
          this.mainVis.showHarsh();
        }
      }, this), this.getAnimationTime() * 1);
    }

    this.shown = true;
    GitDemonstrationView.__super__.show.apply(this);
  },

  die: function() {
    if (!this.visFinished) { return; }

    GitDemonstrationView.__super__.die.apply(this);
  },

  initVis: function() {
    this.mainVis = new Visualization({
      el: this.$('div.visHolder')[0],
      noKeyboardInput: true,
      noClick: true,
      smallCanvas: true,
      zIndex: -1
    });
    this.mainVis.customEvents.on('paperReady', _.bind(function() {
      this.visFinished = true;
      this.dispatchBeforeCommand();
      if (this.shown) {
        // show the canvas once its done if we are shown
        this.show();
      }
    }, this));
  }
});

exports.GitDemonstrationView = GitDemonstrationView;


});

require.define("/src/js/views/builderViews.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var KeyboardListener = require('../util/keyboard').KeyboardListener;

var Views = require('../views');
var ModalTerminal = Views.ModalTerminal;
var ContainedBase = Views.ContainedBase;

var MultiView = require('../views/multiView').MultiView;

var TextGrabber = ContainedBase.extend({
  tagName: 'div',
  className: 'textGrabber box vertical',
  template: _.template($('#text-grabber').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      helperText: options.helperText || 'Enter some text'
    };

    this.container = options.container || new ModalTerminal({
      title: 'Enter some text'
    });
    this.render();
    if (options.initialText) {
      this.setText(options.initialText);
    }

    if (!options.wait) {
      this.show();
    }
  },

  getText: function() {
    return this.$('textarea').val();
  },

  setText: function(str) {
    this.$('textarea').val(str);
  }
});

var MarkdownGrabber = ContainedBase.extend({
  tagName: 'div',
  className: 'markdownGrabber box horizontal',
  template: _.template($('#markdown-grabber-view').html()),
  events: {
    'keyup textarea': 'keyup'
  },

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();

    if (options.fromObj) {
      options.fillerText = options.fromObj.options.markdowns.join('\n');
    }

    this.JSON = {
      previewText: options.previewText || 'Preview',
      fillerText: options.fillerText || '## Enter some markdown!\n\n\n'
    };

    this.container = options.container || new ModalTerminal({
      title: options.title || 'Enter some markdown'
    });
    this.render();

    if (!options.withoutButton) {
      // do button stuff
      var buttonDefer = Q.defer();
      buttonDefer.promise
      .then(_.bind(this.confirmed, this))
      .fail(_.bind(this.cancelled, this))
      .done();

      var confirmCancel = new Views.ConfirmCancelView({
        deferred: buttonDefer,
        destination: this.getDestination()
      });
    }

    this.updatePreview();

    if (!options.wait) {
      this.show();
    }
  },

  confirmed: function() {
    this.die();
    this.deferred.resolve(this.getRawText());
  },

  cancelled: function() {
    this.die();
    this.deferred.resolve();
  },

  keyup: function() {
    if (!this.throttledPreview) {
      this.throttledPreview = _.throttle(
        _.bind(this.updatePreview, this),
        500
      );
    }
    this.throttledPreview();
  },

  getRawText: function() {
    return this.$('textarea').val();
  },

  exportToArray: function() {
    return this.getRawText().split('\n');
  },

  getExportObj: function() {
    return {
      markdowns: this.exportToArray()
    };
  },

  updatePreview: function() {
    var raw = this.getRawText();
    var HTML = require('markdown').markdown.toHTML(raw);
    this.$('div.insidePreview').html(HTML);
  }
});

var MarkdownPresenter = ContainedBase.extend({
  tagName: 'div',
  className: 'markdownPresenter box vertical',
  template: _.template($('#markdown-presenter').html()),

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();
    this.JSON = {
      previewText: options.previewText || 'Here is something for you',
      fillerText: options.fillerText || '# Yay'
    };

    this.container = new ModalTerminal({
      title: 'Check this out...'
    });
    this.render();

    if (!options.noConfirmCancel) {
      var confirmCancel = new Views.ConfirmCancelView({
        destination: this.getDestination()
      });
      confirmCancel.deferred.promise
      .then(_.bind(function() {
        this.deferred.resolve(this.grabText());
      }, this))
      .fail(_.bind(function() {
        this.deferred.reject();
      }, this))
      .done(_.bind(this.die, this));
    }

    this.show();
  },

  grabText: function() {
    return this.$('textarea').val();
  }
});

var DemonstrationBuilder = ContainedBase.extend({
  tagName: 'div',
  className: 'demonstrationBuilder box vertical',
  template: _.template($('#demonstration-builder').html()),
  events: {
    'click div.testButton': 'testView'
  },

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();
    if (options.fromObj) {
      var toEdit = options.fromObj.options;
      options = _.extend(
        {},
        options,
        toEdit,
        {
          beforeMarkdown: toEdit.beforeMarkdowns.join('\n'),
          afterMarkdown: toEdit.afterMarkdowns.join('\n')
        }
      );
    }

    this.JSON = {};
    this.container = new ModalTerminal({
      title: 'Demonstration Builder'
    });
    this.render();

    // build the two markdown grabbers
    this.beforeMarkdownView = new MarkdownGrabber({
      container: this,
      withoutButton: true,
      fillerText: options.beforeMarkdown,
      previewText: 'Before demonstration Markdown'
    });
    this.beforeCommandView = new TextGrabber({
      container: this,
      helperText: 'The git command(s) to set up the demonstration view (before it is displayed)',
      initialText: options.beforeCommand || 'git checkout -b bugFix'
    });

    this.commandView = new TextGrabber({
      container: this,
      helperText: 'The git command(s) to demonstrate to the reader',
      initialText: options.command || 'git commit'
    });

    this.afterMarkdownView = new MarkdownGrabber({
      container: this,
      withoutButton: true,
      fillerText: options.afterMarkdown,
      previewText: 'After demonstration Markdown'
    });

    // build confirm button
    var buttonDeferred = Q.defer();
    var confirmCancel = new Views.ConfirmCancelView({
      deferred: buttonDeferred,
      destination: this.getDestination()
    });

    buttonDeferred.promise
    .then(_.bind(this.confirmed, this))
    .fail(_.bind(this.cancelled, this))
    .done();
  },

  testView: function() {
    new MultiView({
      childViews: [{
        type: 'GitDemonstrationView',
        options: this.getExportObj()
      }]
    });
  },

  getExportObj: function() {
    return {
      beforeMarkdowns: this.beforeMarkdownView.exportToArray(),
      afterMarkdowns: this.afterMarkdownView.exportToArray(),
      command: this.commandView.getText(),
      beforeCommand: this.beforeCommandView.getText()
    };
  },

  confirmed: function() {
    this.die();
    this.deferred.resolve(this.getExportObj());
  },

  cancelled: function() {
    this.die();
    this.deferred.resolve();
  },

  getInsideElement: function() {
    return this.$('.insideBuilder')[0];
  }
});

var MultiViewBuilder = ContainedBase.extend({
  tagName: 'div',
  className: 'multiViewBuilder box vertical',
  template: _.template($('#multi-view-builder').html()),
  typeToConstructor: {
    ModalAlert: MarkdownGrabber,
    GitDemonstrationView: DemonstrationBuilder
  },

  events: {
    'click div.deleteButton': 'deleteOneView',
    'click div.testButton': 'testOneView',
    'click div.editButton': 'editOneView',
    'click div.testEntireView': 'testEntireView',
    'click div.addView': 'addView',
    'click div.saveView': 'saveView',
    'click div.cancelView': 'cancel'
  },

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();
    this.multiViewJSON = options.multiViewJSON || {};

    this.JSON = {
      views: this.getChildViews(),
      supportedViews: _.keys(this.typeToConstructor)
    };

    this.container = new ModalTerminal({
      title: 'Build a MultiView!'
    });
    this.render();

    this.show();
  },

  saveView: function() {
    this.hide();
    this.deferred.resolve(this.multiViewJSON);
  },

  cancel: function() {
    this.hide();
    this.deferred.resolve();
  },

  addView: function(ev) {
    var el = ev.srcElement;
    var type = $(el).attr('data-type');

    var whenDone = Q.defer();
    var Constructor = this.typeToConstructor[type];
    var builder = new Constructor({
      deferred: whenDone
    });
    whenDone.promise
    .then(_.bind(function() {
      var newView = {
        type: type,
        options: builder.getExportObj()
      };
      this.addChildViewObj(newView);
    }, this))
    .fail(function() {
      // they dont want to add the view apparently, so just return
    })
    .done();
  },

  testOneView: function(ev) {
    var el = ev.srcElement;
    var index = $(el).attr('data-index');
    var toTest = this.getChildViews()[index];
    new MultiView({
      childViews: [toTest]
    });
  },

  testEntireView: function() {
    new MultiView({
      childViews: this.getChildViews()
    });
  },

  editOneView: function(ev) {
    var el = ev.srcElement;
    var index = $(el).attr('data-index');
    var type = $(el).attr('data-type');

    var whenDone = Q.defer();
    var builder = new this.typeToConstructor[type]({
      deferred: whenDone,
      fromObj: this.getChildViews()[index]
    });
    whenDone.promise
    .then(_.bind(function() {
      var newView = {
        type: type,
        options: builder.getExportObj()
      };
      var views = this.getChildViews();
      views[index] = newView;
      this.setChildViews(views);
    }, this))
    .fail(function() { })
    .done();
  },

  deleteOneView: function(ev) {
    var el = ev.srcElement;
    var index = $(el).attr('data-index');
    var toSlice = this.getChildViews();

    var updated = toSlice.slice(0,index).concat(toSlice.slice(index + 1));
    this.setChildViews(updated);
    this.update();
  },

  addChildViewObj: function(newObj, index) {
    var childViews = this.getChildViews();
    childViews.push(newObj);
    this.setChildViews(childViews);
    this.update();
  },

  setChildViews: function(newArray) {
    this.multiViewJSON.childViews = newArray;
  },

  getChildViews: function() {
    return this.multiViewJSON.childViews || [];
  },

  update: function() {
    this.JSON.views = this.getChildViews();
    this.renderAgain();
  }
});

exports.MarkdownGrabber = MarkdownGrabber;
exports.DemonstrationBuilder = DemonstrationBuilder;
exports.TextGrabber = TextGrabber;
exports.MultiViewBuilder = MultiViewBuilder;
exports.MarkdownPresenter = MarkdownPresenter;


});

require.define("/src/js/dialogs/levelBuilder.js",function(require,module,exports,__dirname,__filename,process,global){exports.dialog = [{
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Welcome to the level builder!',
      '',
      'Here are the main steps:',
      '',
      '  * Set up the initial environment with git commands',
      '  * Define the starting tree with ```define start```',
      '  * Enter the series of git commands that compose the (optimal) solution',
      '  * Define the goal tree with ```define goal```. Defining the goal also defines the solution',
      '  * Optionally define a hint with ```define hint```',
      '  * Edit the name with ```define name```',
      '  * Optionally define a nice start dialog with ```edit dialog```',
      '  * Enter the command ```finish``` to output your level JSON!'
    ]
  }
}];

});

require.define("/src/js/util/eventBaton.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

function EventBaton() {
  this.eventMap = {};
}

// this method steals the "baton" -- aka, only this method will now
// get called. analogous to events.on
// EventBaton.prototype.on = function(name, func, context) {
EventBaton.prototype.stealBaton = function(name, func, context) {
  if (!name) { throw new Error('need name'); }
  if (!func) { throw new Error('need func!'); }

  var listeners = this.eventMap[name] || [];
  listeners.push({
    func: func,
    context: context
  });
  this.eventMap[name] = listeners;
};

EventBaton.prototype.sliceOffArgs = function(num, args) {
  var newArgs = [];
  for (var i = num; i < args.length; i++) {
    newArgs.push(args[i]);
  }
  return newArgs;
};

EventBaton.prototype.trigger = function(name) {
  // arguments is weird and doesnt do slice right
  var argsToApply = this.sliceOffArgs(1, arguments);

  var listeners = this.eventMap[name];
  if (!listeners || !listeners.length) {
    console.warn('no listeners for', name);
    return;
  }

  // call the top most listener with context and such
  var toCall = listeners.slice(-1)[0];
  toCall.func.apply(toCall.context, argsToApply);
};

EventBaton.prototype.getNumListeners = function(name) {
  var listeners = this.eventMap[name] || [];
  return listeners.length;
};

EventBaton.prototype.getListenersThrow = function(name) {
  var listeners = this.eventMap[name];
  if (!listeners || !listeners.length) {
    throw new Error('no one has that baton!' + name);
  }
  return listeners;
};

EventBaton.prototype.passBatonBackSoft = function(name, func, context, args) {
  try {
    return this.passBatonBack(name, func, context, args);
  } catch (e) {
  }
};

EventBaton.prototype.passBatonBack = function(name, func, context, args) {
  // this method will call the listener BEFORE the name/func pair. this
  // basically allows you to put in shims, where you steal batons but pass
  // them back if they don't meet certain conditions
  var listeners = this.getListenersThrow(name);

  var indexBefore;
  _.each(listeners, function(listenerObj, index) {
    // skip the first
    if (index === 0) { return; }
    if (listenerObj.func === func && listenerObj.context === context) {
      indexBefore = index - 1;
    }
  }, this);
  if (indexBefore === undefined) {
    throw new Error('you are the last baton holder! or i didnt find you');
  }
  var toCallObj = listeners[indexBefore];

  toCallObj.func.apply(toCallObj.context, args);
};

EventBaton.prototype.releaseBaton = function(name, func, context) {
  // might be in the middle of the stack, so we have to loop instead of
  // just popping blindly
  var listeners = this.getListenersThrow(name);

  var newListeners = [];
  var found = false;
  _.each(listeners, function(listenerObj) {
    if (listenerObj.func === func && listenerObj.context === context) {
      if (found) {
        console.warn('woah duplicates!!!');
        console.log(listeners);
      }
      found = true;
    } else {
      newListeners.push(listenerObj);
    }
  }, this);

  if (!found) {
    console.log('did not find that function', func, context, name, arguments);
    console.log(this.eventMap);
    throw new Error('cant releasebaton if yu dont have it');
  }
  this.eventMap[name] = newListeners;
};

exports.EventBaton = EventBaton;


});

require.define("/src/js/visuals/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
var Backbone = require('backbone');

var GRAPHICS = require('../util/constants').GRAPHICS;
var GLOBAL = require('../util/constants').GLOBAL;

var Collections = require('../models/collections');
var CommitCollection = Collections.CommitCollection;
var BranchCollection = Collections.BranchCollection;

var VisNode = require('../visuals/visNode').VisNode;
var VisBranch = require('../visuals/visBranch').VisBranch;
var VisBranchCollection = require('../visuals/visBranch').VisBranchCollection;
var VisEdge = require('../visuals/visEdge').VisEdge;
var VisEdgeCollection = require('../visuals/visEdge').VisEdgeCollection;

function GitVisuals(options) {
  options = options || {};
  this.options = options;
  this.commitCollection = options.commitCollection;
  this.branchCollection = options.branchCollection;
  this.visNodeMap = {};

  this.visEdgeCollection = new VisEdgeCollection();
  this.visBranchCollection = new VisBranchCollection();
  this.commitMap = {};

  this.rootCommit = null;
  this.branchStackMap = null;
  this.upstreamBranchSet = null;
  this.upstreamHeadSet = null;

  this.paper = options.paper;
  this.gitReady = false;

  this.branchCollection.on('add', this.addBranchFromEvent, this);
  this.branchCollection.on('remove', this.removeBranch, this);
  this.deferred = [];

  // eventually have origin support here
  this.posBoundaries = {
    min: 0,
    max: 1
  };

  var Main = require('../app');
  Main.getEvents().on('refreshTree', this.refreshTree, this);
}

GitVisuals.prototype.defer = function(action) {
  this.deferred.push(action);
};

GitVisuals.prototype.deferFlush = function() {
  _.each(this.deferred, function(action) {
    action();
  }, this);
  this.deferred = [];
};

GitVisuals.prototype.resetAll = function() {
  // make sure to copy these collections because we remove
  // items in place and underscore is too dumb to detect length change
  var edges = this.visEdgeCollection.toArray();
  _.each(edges, function(visEdge) {
    visEdge.remove();
  }, this);

  var branches = this.visBranchCollection.toArray();
  _.each(branches, function(visBranch) {
    visBranch.remove();
  }, this);

  _.each(this.visNodeMap, function(visNode) {
    visNode.remove();
  }, this);

  this.visEdgeCollection.reset();
  this.visBranchCollection.reset();

  this.visNodeMap = {};
  this.rootCommit = null;
  this.commitMap = {};
};

GitVisuals.prototype.tearDown = function() {
  this.resetAll();
  this.paper.remove();
};

GitVisuals.prototype.assignGitEngine = function(gitEngine) {
  this.gitEngine = gitEngine;
  this.initHeadBranch();
  this.deferFlush();
};

GitVisuals.prototype.initHeadBranch = function() {
  // it's unfortaunte we have to do this, but the head branch
  // is an edge case because it's not part of a collection so
  // we can't use events to load or unload it. thus we have to call
  // this ugly method which will be deleted one day

  // seed this with the HEAD pseudo-branch
  this.addBranchFromEvent(this.gitEngine.HEAD);
};

GitVisuals.prototype.getScreenPadding = function() {
  // for now we return the node radius subtracted from the walls
  return {
    widthPadding: GRAPHICS.nodeRadius * 1.5,
    heightPadding: GRAPHICS.nodeRadius * 1.5
  };
};

GitVisuals.prototype.toScreenCoords = function(pos) {
  if (!this.paper.width) {
    throw new Error('being called too early for screen coords');
  }
  var padding = this.getScreenPadding();

  var shrink = function(frac, total, padding) {
    return padding + frac * (total - padding * 2);
  };

  return {
    x: shrink(pos.x, this.paper.width, padding.widthPadding),
    y: shrink(pos.y, this.paper.height, padding.heightPadding)
  };
};

GitVisuals.prototype.animateAllAttrKeys = function(keys, attr, speed, easing) {
  var deferred = Q.defer();

  var animate = function(visObj) {
    visObj.animateAttrKeys(keys, attr, speed, easing);
  };

  this.visBranchCollection.each(animate);
  this.visEdgeCollection.each(animate);
  _.each(this.visNodeMap, animate);

  var time = (speed !== undefined) ? speed : GRAPHICS.defaultAnimationTime;
  setTimeout(function() {
    deferred.resolve();
  }, time);

  return deferred.promise;
};

GitVisuals.prototype.finishAnimation = function() {
  var _this = this;
  var deferred = Q.defer();
  var animationDone = Q.defer();
  var defaultTime = GRAPHICS.defaultAnimationTime;
  var nodeRadius = GRAPHICS.nodeRadius;

  var textString = 'Solved!!\n:D';
  var text = null;
  var makeText = _.bind(function() {
    text = this.paper.text(
      this.paper.width / 2,
      this.paper.height / 2,
      textString
    );
    text.attr({
      opacity: 0,
      'font-weight': 500,
      'font-size': '32pt',
      'font-family': 'Monaco, Courier, font-monospace',
      stroke: '#000',
      'stroke-width': 2,
      fill: '#000'
    });
    text.animate({ opacity: 1 }, defaultTime);
  }, this);

  // this is a BIG ANIMATION but it ends up just being
  // a sweet chain of promises but is pretty nice. this is
  // after I discovered promises / deferred's. Unfortunately
  // I wrote a lot of the git stuff before promises, so
  // that's somewhat ugly

  deferred.promise
  // first fade out everything but circles
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['circle'] },
      { opacity: 0 },
      defaultTime * 1.1
    );
  }, this))
  // then make circle radii bigger
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['arrow', 'rect', 'path', 'text'] },
      { r: nodeRadius * 2 },
      defaultTime * 1.5
    );
  }, this))
  // then shrink em super fast
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['arrow', 'rect', 'path', 'text'] },
      { r: nodeRadius * 0.75 },
      defaultTime * 0.5
    );
  }, this))
  // then explode them and display text
  .then(_.bind(function() {
    makeText();
    return this.explodeNodes();
  }, this))
  .then(_.bind(function() {
    return this.explodeNodes();
  }, this))
  // then fade circles (aka everything) in and back
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['arrow', 'rect', 'path', 'text'] },
      {},
      defaultTime * 1.25
    );
  }, this))
  // then fade everything in and remove text
  .then(_.bind(function() {
    text.animate({ opacity: 0 }, defaultTime, undefined, undefined, function() {
      text.remove();
    });
    return this.animateAllAttrKeys(
      {},
      {}
    );
  }, this))
  .then(function() {
    animationDone.resolve();
  })
  .fail(function(reason) {
    console.warn('animation error' + reason);
  })
  .done();

  // start our animation chain right away
  deferred.resolve();
  return animationDone.promise;
};

GitVisuals.prototype.explodeNodes = function() {
  var deferred = Q.defer();
  var funcs = [];
  _.each(this.visNodeMap, function(visNode) {
    funcs.push(visNode.getExplodeStepFunc());
  });

  var interval = setInterval(function() {
    // object creation here is a bit ugly inside a loop,
    // but the alternative is to just OR against a bunch
    // of booleans which means the other stepFuncs
    // are called unnecessarily when they have almost
    // zero speed. would be interesting to see performance differences
    var keepGoing = [];
    _.each(funcs, function(func) {
      if (func()) {
        keepGoing.push(func);
      }
    });

    if (!keepGoing.length) {
      clearInterval(interval);
      // next step :D wow I love promises
      deferred.resolve();
      return;
    }

    funcs = keepGoing;
  }, 1/40);

  return deferred.promise;
};

GitVisuals.prototype.animateAllFromAttrToAttr = function(fromSnapshot, toSnapshot, idsToOmit) {
  var animate = function(obj) {
    var id = obj.getID();
    if (_.include(idsToOmit, id)) {
      return;
    }

    if (!fromSnapshot[id] || !toSnapshot[id]) {
      // its actually ok it doesnt exist yet
      return;
    }
    obj.animateFromAttrToAttr(fromSnapshot[id], toSnapshot[id]);
  };

  this.visBranchCollection.each(animate);
  this.visEdgeCollection.each(animate);
  _.each(this.visNodeMap, animate);
};

/***************************************
     == BEGIN Tree Calculation Parts ==
       _  __    __  _
       \\/ /    \ \//_
        \ \     /   __|   __
         \ \___/   /_____/ /
          |        _______ \
          \  ( )   /      \_\
           \      /
            |    |
            |    |
  ____+-_=+-^    ^+-=_=__________

^^ I drew that :D

 **************************************/

GitVisuals.prototype.genSnapshot = function() {
  this.fullCalc();

  var snapshot = {};
  _.each(this.visNodeMap, function(visNode) {
    snapshot[visNode.get('id')] = visNode.getAttributes();
  }, this);

  this.visBranchCollection.each(function(visBranch) {
    snapshot[visBranch.getID()] = visBranch.getAttributes();
  }, this);

  this.visEdgeCollection.each(function(visEdge) {
    snapshot[visEdge.getID()] = visEdge.getAttributes();
  }, this);

  return snapshot;
};

GitVisuals.prototype.refreshTree = function(speed) {
  if (!this.gitReady || !this.gitEngine.rootCommit) {
    return;
  }

  // this method can only be called after graphics are rendered
  this.fullCalc();

  this.animateAll(speed);
};

GitVisuals.prototype.refreshTreeHarsh = function() {
  this.fullCalc();

  this.animateAll(0);
};

GitVisuals.prototype.animateAll = function(speed) {
  this.zIndexReflow();

  this.animateEdges(speed);
  this.animateNodePositions(speed);
  this.animateRefs(speed);
};

GitVisuals.prototype.fullCalc = function() {
  this.calcTreeCoords();
  this.calcGraphicsCoords();
};

GitVisuals.prototype.calcTreeCoords = function() {
  // this method can only contain things that dont rely on graphics
  if (!this.rootCommit) {
    throw new Error('grr, no root commit!');
  }

  this.calcUpstreamSets();
  this.calcBranchStacks();

  this.calcDepth();
  this.calcWidth();
};

GitVisuals.prototype.calcGraphicsCoords = function() {
  this.visBranchCollection.each(function(visBranch) {
    visBranch.updateName();
  });
};

GitVisuals.prototype.calcUpstreamSets = function() {
  this.upstreamBranchSet = this.gitEngine.getUpstreamBranchSet();
  this.upstreamHeadSet = this.gitEngine.getUpstreamHeadSet();
};

GitVisuals.prototype.getCommitUpstreamBranches = function(commit) {
  return this.branchStackMap[commit.get('id')];
};

GitVisuals.prototype.getBlendedHuesForCommit = function(commit) {
  var branches = this.upstreamBranchSet[commit.get('id')];
  if (!branches) {
    throw new Error('that commit doesnt have upstream branches!');
  }

  return this.blendHuesFromBranchStack(branches);
};

GitVisuals.prototype.blendHuesFromBranchStack = function(branchStackArray) {
  var hueStrings = [];
  _.each(branchStackArray, function(branchWrapper) {
    var fill = branchWrapper.obj.get('visBranch').get('fill');

    if (fill.slice(0,3) !== 'hsb') {
      // crap! convert
      var color = Raphael.color(fill);
      fill = 'hsb(' + String(color.h) + ',' + String(color.l);
      fill = fill + ',' + String(color.s) + ')';
    }

    hueStrings.push(fill);
  });

  return blendHueStrings(hueStrings);
};

GitVisuals.prototype.getCommitUpstreamStatus = function(commit) {
  if (!this.upstreamBranchSet) {
    throw new Error("Can't calculate this yet!");
  }

  var id = commit.get('id');
  var branch = this.upstreamBranchSet;
  var head = this.upstreamHeadSet;

  if (branch[id]) {
    return 'branch';
  } else if (head[id]) {
    return 'head';
  } else {
    return 'none';
  }
};

GitVisuals.prototype.calcBranchStacks = function() {
  var branches = this.gitEngine.getBranches();
  var map = {};
  _.each(branches, function(branch) {
    var thisId = branch.target.get('id');

    map[thisId] = map[thisId] || [];
    map[thisId].push(branch);
    map[thisId].sort(function(a, b) {
      var aId = a.obj.get('id');
      var bId = b.obj.get('id');
      if (aId == 'master' || bId == 'master') {
        return aId == 'master' ? -1 : 1;
      }
      return aId.localeCompare(bId);
    });
  });
  this.branchStackMap = map;
};

GitVisuals.prototype.calcWidth = function() {
  this.maxWidthRecursive(this.rootCommit);

  this.assignBoundsRecursive(
    this.rootCommit,
    this.posBoundaries.min,
    this.posBoundaries.max
  );
};

GitVisuals.prototype.maxWidthRecursive = function(commit) {
  var childrenTotalWidth = 0;
  _.each(commit.get('children'), function(child) {
    // only include this if we are the "main" parent of
    // this child
    if (child.isMainParent(commit)) {
      var childWidth = this.maxWidthRecursive(child);
      childrenTotalWidth += childWidth;
    }
  }, this);

  var maxWidth = Math.max(1, childrenTotalWidth);
  commit.get('visNode').set('maxWidth', maxWidth);
  return maxWidth;
};

GitVisuals.prototype.assignBoundsRecursive = function(commit, min, max) {
  // I always center myself within my bounds
  var myWidthPos = (min + max) / 2.0;
  commit.get('visNode').get('pos').x = myWidthPos;

  if (commit.get('children').length === 0) {
    return;
  }

  // i have a certain length to divide up
  var myLength = max - min;
  // I will divide up that length based on my children's max width in a
  // basic box-flex model
  var totalFlex = 0;
  var children = commit.get('children');
  _.each(children, function(child) {
    if (child.isMainParent(commit)) {
      totalFlex += child.get('visNode').getMaxWidthScaled();
    }
  }, this);

  var prevBound = min;

  // now go through and do everything
  // TODO: order so the max width children are in the middle!!
  _.each(children, function(child) {
    if (!child.isMainParent(commit)) {
      return;
    }

    var flex = child.get('visNode').getMaxWidthScaled();
    var portion = (flex / totalFlex) * myLength;
    var childMin = prevBound;
    var childMax = childMin + portion;
    this.assignBoundsRecursive(child, childMin, childMax);
    prevBound = childMax;
  }, this);
};

GitVisuals.prototype.calcDepth = function() {
  var maxDepth = this.calcDepthRecursive(this.rootCommit, 0);
  if (maxDepth > 15) {
    // issue warning
    console.warn('graphics are degrading from too many layers');
  }

  var depthIncrement = this.getDepthIncrement(maxDepth);
  _.each(this.visNodeMap, function(visNode) {
    visNode.setDepthBasedOn(depthIncrement);
  }, this);
};

/***************************************
     == END Tree Calculation ==
       _  __    __  _
       \\/ /    \ \//_
        \ \     /   __|   __
         \ \___/   /_____/ /
          |        _______ \
          \  ( )   /      \_\
           \      /
            |    |
            |    |
  ____+-_=+-^    ^+-=_=__________

^^ I drew that :D

 **************************************/

GitVisuals.prototype.animateNodePositions = function(speed) {
  _.each(this.visNodeMap, function(visNode) {
    visNode.animateUpdatedPosition(speed);
  }, this);
};

GitVisuals.prototype.addBranchFromEvent = function(branch, collection, index) {
  var action = _.bind(function() {
    this.addBranch(branch);
  }, this);

  if (!this.gitEngine || !this.gitReady) {
    this.defer(action);
  } else {
    action();
  }
};

GitVisuals.prototype.addBranch = function(branch) {
  var visBranch = new VisBranch({
    branch: branch,
    gitVisuals: this,
    gitEngine: this.gitEngine
  });

  this.visBranchCollection.add(visBranch);
  if (this.gitReady) {
    visBranch.genGraphics(this.paper);
  } else {
    this.defer(_.bind(function() {
      visBranch.genGraphics(this.paper);
    }, this));
  }
};

GitVisuals.prototype.removeVisBranch = function(visBranch) {
  this.visBranchCollection.remove(visBranch);
};

GitVisuals.prototype.removeVisNode = function(visNode) {
  this.visNodeMap[visNode.getID()] = undefined;
};

GitVisuals.prototype.removeVisEdge = function(visEdge) {
  this.visEdgeCollection.remove(visEdge);
};

GitVisuals.prototype.animateRefs = function(speed) {
  this.visBranchCollection.each(function(visBranch) {
    visBranch.animateUpdatedPos(speed);
  }, this);
};

GitVisuals.prototype.animateEdges = function(speed) {
  this.visEdgeCollection.each(function(edge) {
    edge.animateUpdatedPath(speed);
  }, this);
};

GitVisuals.prototype.getMinLayers = function() {
  return (this.options.smallCanvas) ? 4 : 7;
};

GitVisuals.prototype.getDepthIncrement = function(maxDepth) {
  // assume there are at least a number of layers until later
  // to have better visuals
  maxDepth = Math.max(maxDepth, this.getMinLayers());
  var increment = 1.0 / maxDepth;
  return increment;
};

GitVisuals.prototype.calcDepthRecursive = function(commit, depth) {
  commit.get('visNode').setDepth(depth);

  var children = commit.get('children');
  var maxDepth = depth;
  _.each(children, function(child) {
    var d = this.calcDepthRecursive(child, depth + 1);
    maxDepth = Math.max(d, maxDepth);
  }, this);

  return maxDepth;
};

// we debounce here so we aren't firing a resize call on every resize event
// but only after they stop
GitVisuals.prototype.canvasResize = function(width, height) {
  if (!this.resizeFunc) {
    this.genResizeFunc();
  }
  this.resizeFunc(width, height);
};

GitVisuals.prototype.genResizeFunc = function() {
  this.resizeFunc = _.debounce(
    _.bind(function(width, height) {

      // refresh when we are ready if we are animating som ething
      if (GLOBAL.isAnimating) {
        var Main = require('../app');
        Main.getEventBaton().trigger('commandSubmitted', 'refresh');
      } else {
        this.refreshTree();
      }
    }, this),
    200,
    true
  );
};

GitVisuals.prototype.addNode = function(id, commit) {
  this.commitMap[id] = commit;
  if (commit.get('rootCommit')) {
    this.rootCommit = commit;
  }

  var visNode = new VisNode({
    id: id,
    commit: commit,
    gitVisuals: this,
    gitEngine: this.gitEngine
  });
  this.visNodeMap[id] = visNode;

  if (this.gitReady) {
    visNode.genGraphics(this.paper);
  }
  return visNode;
};

GitVisuals.prototype.addEdge = function(idTail, idHead) {
  var visNodeTail = this.visNodeMap[idTail];
  var visNodeHead = this.visNodeMap[idHead];

  if (!visNodeTail || !visNodeHead) {
    throw new Error('one of the ids in (' + idTail +
                    ', ' + idHead + ') does not exist');
  }

  var edge = new VisEdge({
    tail: visNodeTail,
    head: visNodeHead,
    gitVisuals: this,
    gitEngine: this.gitEngine
  });
  this.visEdgeCollection.add(edge);

  if (this.gitReady) {
    edge.genGraphics(this.paper);
  }
};

GitVisuals.prototype.zIndexReflow = function() {
  this.visNodesFront();
  this.visBranchesFront();
};

GitVisuals.prototype.visNodesFront = function() {
  _.each(this.visNodeMap, function(visNode) {
    visNode.toFront();
  });
};

GitVisuals.prototype.visBranchesFront = function() {
  this.visBranchCollection.each(function(vBranch) {
    vBranch.nonTextToFront();
    vBranch.textToFront();
  });

  this.visBranchCollection.each(function(vBranch) {
    vBranch.textToFrontIfInStack();
  });
};

GitVisuals.prototype.drawTreeFromReload = function() {
  this.gitReady = true;
  // gen all the graphics we need
  this.deferFlush();

  this.calcTreeCoords();
};

GitVisuals.prototype.drawTreeFirstTime = function() {
  this.gitReady = true;
  this.calcTreeCoords();

  _.each(this.visNodeMap, function(visNode) {
    visNode.genGraphics(this.paper);
  }, this);

  this.visEdgeCollection.each(function(edge) {
    edge.genGraphics(this.paper);
  }, this);

  this.visBranchCollection.each(function(visBranch) {
    visBranch.genGraphics(this.paper);
  }, this);

  this.zIndexReflow();
};


/************************
 * Random util functions, some from liquidGraph
 ***********************/
function blendHueStrings(hueStrings) {
  // assumes a sat of 0.7 and brightness of 1

  var x = 0;
  var y = 0;
  var totalSat = 0;
  var totalBright = 0;
  var length = hueStrings.length;

  _.each(hueStrings, function(hueString) {
    var exploded = hueString.split('(')[1];
    exploded = exploded.split(')')[0];
    exploded = exploded.split(',');

    totalSat += parseFloat(exploded[1]);
    totalBright += parseFloat(exploded[2]);
    var hue = parseFloat(exploded[0]);

    var angle = hue * Math.PI * 2;
    x += Math.cos(angle);
    y += Math.sin(angle);
  });

  x = x / length;
  y = y / length;
  totalSat = totalSat / length;
  totalBright = totalBright / length;

  var hue = Math.atan2(y, x) / (Math.PI * 2); // could fail on 0's
  if (hue < 0) {
    hue = hue + 1;
  }
  return 'hsb(' + String(hue) + ',' + String(totalSat) + ',' + String(totalBright) + ')';
}

exports.GitVisuals = GitVisuals;


});

require.define("/src/js/visuals/visNode.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GRAPHICS = require('../util/constants').GRAPHICS;

var VisBase = require('../visuals/visBase').VisBase;

var VisNode = VisBase.extend({
  defaults: {
    depth: undefined,
    maxWidth: null,
    outgoingEdges: null,

    circle: null,
    text: null,

    id: null,
    pos: null,
    radius: null,

    commit: null,
    animationSpeed: GRAPHICS.defaultAnimationTime,
    animationEasing: GRAPHICS.defaultEasing,

    fill: GRAPHICS.defaultNodeFill,
    'stroke-width': GRAPHICS.defaultNodeStrokeWidth,
    stroke: GRAPHICS.defaultNodeStroke
  },

  getID: function() {
    return this.get('id');
  },

  validateAtInit: function() {
    if (!this.get('id')) {
      throw new Error('need id for mapping');
    }
    if (!this.get('commit')) {
      throw new Error('need commit for linking');
    }

    if (!this.get('pos')) {
      this.set('pos', {
        x: Math.random(),
        y: Math.random()
      });
    }
  },

  initialize: function() {
    this.validateAtInit();
    // shorthand for the main objects
    this.gitVisuals = this.get('gitVisuals');
    this.gitEngine = this.get('gitEngine');

    this.set('outgoingEdges', []);
  },

  setDepth: function(depth) {
    // for merge commits we need to max the depths across all
    this.set('depth', Math.max(this.get('depth') || 0, depth));
  },

  setDepthBasedOn: function(depthIncrement) {
    if (this.get('depth') === undefined) {
      debugger;
      throw new Error('no depth yet!');
    }
    var pos = this.get('pos');
    pos.y = this.get('depth') * depthIncrement;
  },

  getMaxWidthScaled: function() {
    // returns our max width scaled based on if we are visible
    // from a branch or not
    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('commit'));
    var map = {
      branch: 1,
      head: 0.3,
      none: 0.1
    };
    if (map[stat] === undefined) { throw new Error('bad stat'); }
    return map[stat] * this.get('maxWidth');
  },

  toFront: function() {
    this.get('circle').toFront();
    this.get('text').toFront();
  },

  getOpacity: function() {
    var map = {
      'branch': 1,
      'head': GRAPHICS.upstreamHeadOpacity,
      'none': GRAPHICS.upstreamNoneOpacity
    };

    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('commit'));
    if (map[stat] === undefined) {
      throw new Error('invalid status');
    }
    return map[stat];
  },

  getTextScreenCoords: function() {
    return this.getScreenCoords();
  },

  getAttributes: function() {
    var pos = this.getScreenCoords();
    var textPos = this.getTextScreenCoords();
    var opacity = this.getOpacity();

    return {
      circle: {
        cx: pos.x,
        cy: pos.y,
        opacity: opacity,
        r: this.getRadius(),
        fill: this.getFill(),
        'stroke-width': this.get('stroke-width'),
        stroke: this.get('stroke')
      },
      text: {
        x: textPos.x,
        y: textPos.y,
        opacity: opacity
      }
    };
  },

  highlightTo: function(visObj, speed, easing) {
    // a small function to highlight the color of a node for demonstration purposes
    var color = visObj.get('fill');

    var attr = {
      circle: {
        fill: color,
        stroke: color,
        'stroke-width': this.get('stroke-width') * 5
      },
      text: {}
    };

    this.animateToAttr(attr, speed, easing);
  },

  animateUpdatedPosition: function(speed, easing) {
    var attr = this.getAttributes();
    this.animateToAttr(attr, speed, easing);
  },

  animateFromAttrToAttr: function(fromAttr, toAttr, speed, easing) {
    // an animation of 0 is essentially setting the attribute directly
    this.animateToAttr(fromAttr, 0);
    this.animateToAttr(toAttr, speed, easing);
  },

  animateToSnapshot: function(snapShot, speed, easing) {
    if (!snapShot[this.getID()]) {
      return;
    }
    this.animateToAttr(snapShot[this.getID()], speed, easing);
  },

  animateToAttr: function(attr, speed, easing) {
    if (speed === 0) {
      this.get('circle').attr(attr.circle);
      this.get('text').attr(attr.text);
      return;
    }

    var s = speed !== undefined ? speed : this.get('animationSpeed');
    var e = easing || this.get('animationEasing');

    this.get('circle').stop().animate(attr.circle, s, e);
    this.get('text').stop().animate(attr.text, s, e);

    if (easing == 'bounce' &&
        attr.circle && attr.circle.cx !== undefined &&
        attr.text && attr.text.x !== undefined ) {
      // animate the x attribute without bouncing so it looks like there's
      // gravity in only one direction. Just a small animation polish
      this.get('circle').animate(attr.circle.cx, s, 'easeInOut');
      this.get('text').animate(attr.text.x, s, 'easeInOut');
    }
  },

  getScreenCoords: function() {
    var pos = this.get('pos');
    return this.gitVisuals.toScreenCoords(pos);
  },

  getRadius: function() {
    return this.get('radius') || GRAPHICS.nodeRadius;
  },

  getParentScreenCoords: function() {
    return this.get('commit').get('parents')[0].get('visNode').getScreenCoords();
  },

  setBirthPosition: function() {
    // utility method for animating it out from underneath a parent
    var parentCoords = this.getParentScreenCoords();

    this.get('circle').attr({
      cx: parentCoords.x,
      cy: parentCoords.y,
      opacity: 0,
      r: 0
    });
    this.get('text').attr({
      x: parentCoords.x,
      y: parentCoords.y,
      opacity: 0
    });
  },

  setBirthFromSnapshot: function(beforeSnapshot) {
    // first get parent attribute
    // woof this is pretty bad data access...
    var parentID = this.get('commit').get('parents')[0].get('visNode').getID();
    var parentAttr = beforeSnapshot[parentID];

    // then set myself faded on top of parent
    this.get('circle').attr({
      opacity: 0,
      r: 0,
      cx: parentAttr.circle.cx,
      cy: parentAttr.circle.cy
    });

    this.get('text').attr({
      opacity: 0,
      x: parentAttr.text.x,
      y: parentAttr.text.y
    });

    // then do edges
    var parentCoords = {
      x: parentAttr.circle.cx,
      y: parentAttr.circle.cy
    };
    this.setOutgoingEdgesBirthPosition(parentCoords);
  },

  setBirth: function() {
    this.setBirthPosition();
    this.setOutgoingEdgesBirthPosition(this.getParentScreenCoords());
  },

  setOutgoingEdgesOpacity: function(opacity) {
    _.each(this.get('outgoingEdges'), function(edge) {
      edge.setOpacity(opacity);
    });
  },

  animateOutgoingEdgesToAttr: function(snapShot, speed, easing) {
    _.each(this.get('outgoingEdges'), function(edge) {
      var attr = snapShot[edge.getID()];
      edge.animateToAttr(attr);
    }, this);
  },

  animateOutgoingEdges: function(speed, easing) {
    _.each(this.get('outgoingEdges'), function(edge) {
      edge.animateUpdatedPath(speed, easing);
    }, this);
  },

  animateOutgoingEdgesFromSnapshot: function(snapshot, speed, easing) {
    _.each(this.get('outgoingEdges'), function(edge) {
      var attr = snapshot[edge.getID()];
      edge.animateToAttr(attr, speed, easing);
    }, this);
  },

  setOutgoingEdgesBirthPosition: function(parentCoords) {
    _.each(this.get('outgoingEdges'), function(edge) {
      var headPos = edge.get('head').getScreenCoords();
      var path = edge.genSmoothBezierPathStringFromCoords(parentCoords, headPos);
      edge.get('path').stop().attr({
        path: path,
        opacity: 0
      });
    }, this);
  },

  parentInFront: function() {
    // woof! talk about bad data access
    this.get('commit').get('parents')[0].get('visNode').toFront();
  },

  getFontSize: function(str) {
    if (str.length < 3) {
      return 12;
    } else if (str.length < 5) {
      return 10;
    } else {
      return 8;
    }
  },

  getFill: function() {
    // first get our status, might be easy from this
    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('commit'));
    if (stat == 'head') {
      return GRAPHICS.headRectFill;
    } else if (stat == 'none') {
      return GRAPHICS.orphanNodeFill;
    }

    // now we need to get branch hues
    return this.gitVisuals.getBlendedHuesForCommit(this.get('commit'));
  },

  attachClickHandlers: function() {
    if (this.get('gitVisuals').options.noClick) {
      return;
    }
    var commandStr = 'git checkout ' + this.get('commit').get('id');
    var Main = require('../app');
    _.each([this.get('circle'), this.get('text')], function(rObj) {
      rObj.click(function() {
        Main.getEventBaton().trigger('commandSubmitted', commandStr);
      });
      $(rObj.node).css('cursor', 'pointer');
    });
  },

  setOpacity: function(opacity) {
    opacity = (opacity === undefined) ? 1 : opacity;

    // set the opacity on my stuff
    var keys = ['circle', 'text'];
    _.each(keys, function(key) {
      this.get(key).attr({
        opacity: opacity
      });
    }, this);
  },

  remove: function() {
    this.removeKeys(['circle'], ['text']);
    // needs a manual removal of text for whatever reason
    var text = this.get('text');
    if (text) {
      text.remove();
    }

    this.gitVisuals.removeVisNode(this);
  },

  removeAll: function() {
    this.remove();
    _.each(this.get('outgoingEdges'), function(edge) {
      edge.remove();
    }, this);
  },

  getExplodeStepFunc: function() {
    var circle = this.get('circle');

    // decide on a speed
    var speedMag = 20;
    // aim upwards
    var angle = Math.PI + Math.random() * 1 * Math.PI;
    var gravity = 1 / 5;
    var drag = 1 / 100;

    var vx = speedMag * Math.cos(angle);
    var vy = speedMag * Math.sin(angle);
    var x = circle.attr('cx');
    var y = circle.attr('cy');

    var maxWidth = this.gitVisuals.paper.width;
    var maxHeight = this.gitVisuals.paper.height;
    var elasticity = 0.8;
    var dt = 1.0;

    var stepFunc = function() {
      // lol epic runge kutta here... not
      vy += gravity * dt - drag * vy;
      vx -= drag * vx;
      x += vx * dt;
      y += vy * dt;

      if (x < 0 || x > maxWidth) {
        vx = elasticity * -vx;
        x = (x < 0) ? 0 : maxWidth;
      }
      if (y < 0 || y > maxHeight) {
        vy = elasticity * -vy;
        y = (y < 0) ? 0 : maxHeight;
      }

      circle.attr({
        cx: x,
        cy: y
      });
      // continuation calculation
      if ((vx * vx + vy * vy) < 0.01 && Math.abs(y - maxHeight) === 0) {
        // dont need to animate anymore, we are on ground
        return false;
      }
      // keep animating!
      return true;
    };
    return stepFunc;
  },

  genGraphics: function() {
    var paper = this.gitVisuals.paper;

    var pos = this.getScreenCoords();
    var textPos = this.getTextScreenCoords();

    var circle = paper.circle(
      pos.x,
      pos.y,
      this.getRadius()
    ).attr(this.getAttributes().circle);

    var text = paper.text(textPos.x, textPos.y, String(this.get('id')));
    text.attr({
      'font-size': this.getFontSize(this.get('id')),
      'font-weight': 'bold',
      'font-family': 'Monaco, Courier, font-monospace',
      opacity: this.getOpacity()
    });

    this.set('circle', circle);
    this.set('text', text);

    this.attachClickHandlers();
  }
});

exports.VisNode = VisNode;

});

require.define("/src/js/visuals/visBase.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var VisBase = Backbone.Model.extend({
  removeKeys: function(keys) {
    _.each(keys, function(key) {
      if (this.get(key)) {
        this.get(key).remove();
      }
    }, this);
  },

  animateAttrKeys: function(keys, attrObj, speed, easing) {
    // either we animate a specific subset of keys or all
    // possible things we could animate
    keys = _.extend(
      {},
      {
        include: ['circle', 'arrow', 'rect', 'path', 'text'],
        exclude: []
      },
      keys || {}
    );

    var attr = this.getAttributes();

    // safely insert this attribute into all the keys we want
    _.each(keys.include, function(key) {
      attr[key] = _.extend(
        {},
        attr[key],
        attrObj
      );
    });

    _.each(keys.exclude, function(key) {
      delete attr[key];
    });

    this.animateToAttr(attr, speed, easing);
  }
});

exports.VisBase = VisBase;


});

require.define("/src/js/visuals/visBranch.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GRAPHICS = require('../util/constants').GRAPHICS;

var VisBase = require('../visuals/visBase').VisBase;

var randomHueString = function() {
  var hue = Math.random();
  var str = 'hsb(' + String(hue) + ',0.7,1)';
  return str;
};

var VisBranch = VisBase.extend({
  defaults: {
    pos: null,
    text: null,
    rect: null,
    arrow: null,
    isHead: false,
    flip: 1,

    fill: GRAPHICS.rectFill,
    stroke: GRAPHICS.rectStroke,
    'stroke-width': GRAPHICS.rectStrokeWidth,

    offsetX: GRAPHICS.nodeRadius * 4.75,
    offsetY: 0,
    arrowHeight: 14,
    arrowInnerSkew: 0,
    arrowEdgeHeight: 6,
    arrowLength: 14,
    arrowOffsetFromCircleX: 10,

    vPad: 5,
    hPad: 5,

    animationSpeed: GRAPHICS.defaultAnimationTime,
    animationEasing: GRAPHICS.defaultEasing
  },

  validateAtInit: function() {
    if (!this.get('branch')) {
      throw new Error('need a branch!');
    }
  },

  getID: function() {
    return this.get('branch').get('id');
  },

  initialize: function() {
    this.validateAtInit();

    // shorthand notation for the main objects
    this.gitVisuals = this.get('gitVisuals');
    this.gitEngine = this.get('gitEngine');
    if (!this.gitEngine) {
      throw new Error('asd wtf');
    }

    this.get('branch').set('visBranch', this);
    var id = this.get('branch').get('id');

    if (id == 'HEAD') {
      // switch to a head ref
      this.set('isHead', true);
      this.set('flip', -1);

      this.set('fill', GRAPHICS.headRectFill);
    } else if (id !== 'master') {
      // we need to set our color to something random
      this.set('fill', randomHueString());
    }
  },

  getCommitPosition: function() {
    var commit = this.gitEngine.getCommitFromRef(this.get('branch'));
    var visNode = commit.get('visNode');

    var threshold = this.get('gitVisuals').posBoundaries.max;
    // somewhat tricky flip management here
    if (visNode.get('pos').x > threshold) {
      this.set('flip', -1);
    } else {
      this.set('flip', 1);
    }
    return visNode.getScreenCoords();
  },

  getBranchStackIndex: function() {
    if (this.get('isHead')) {
      // head is never stacked with other branches
      return 0;
    }

    var myArray = this.getBranchStackArray();
    var index = -1;
    _.each(myArray, function(branch, i) {
      if (branch.obj == this.get('branch')) {
        index = i;
      }
    }, this);
    return index;
  },

  getBranchStackLength: function() {
    if (this.get('isHead')) {
      // head is always by itself
      return 1;
    }

    return this.getBranchStackArray().length;
  },

  getBranchStackArray: function() {
    var arr = this.gitVisuals.branchStackMap[this.get('branch').get('target').get('id')];
    if (arr === undefined) {
      // this only occurs when we are generating graphics inside of
      // a new Branch instantiation, so we need to force the update
      this.gitVisuals.calcBranchStacks();
      return this.getBranchStackArray();
    }
    return arr;
  },

  getTextPosition: function() {
    var pos = this.getCommitPosition();

    // then order yourself accordingly. we use alphabetical sorting
    // so everything is independent
    var myPos = this.getBranchStackIndex();
    return {
      x: pos.x + this.get('flip') * this.get('offsetX'),
      y: pos.y + myPos * GRAPHICS.multiBranchY + this.get('offsetY')
    };
  },

  getRectPosition: function() {
    var pos = this.getTextPosition();
    var f = this.get('flip');

    // first get text width and height
    var textSize = this.getTextSize();
    return {
      x: pos.x - 0.5 * textSize.w - this.get('hPad'),
      y: pos.y - 0.5 * textSize.h - this.get('vPad')
    };
  },

  getArrowPath: function() {
    // should make these util functions...
    var offset2d = function(pos, x, y) {
      return {
        x: pos.x + x,
        y: pos.y + y
      };
    };
    var toStringCoords = function(pos) {
      return String(Math.round(pos.x)) + ',' + String(Math.round(pos.y));
    };
    var f = this.get('flip');

    var arrowTip = offset2d(this.getCommitPosition(),
      f * this.get('arrowOffsetFromCircleX'),
      0
    );
    var arrowEdgeUp = offset2d(arrowTip, f * this.get('arrowLength'), -this.get('arrowHeight'));
    var arrowEdgeLow = offset2d(arrowTip, f * this.get('arrowLength'), this.get('arrowHeight'));

    var arrowInnerUp = offset2d(arrowEdgeUp,
      f * this.get('arrowInnerSkew'),
      this.get('arrowEdgeHeight')
    );
    var arrowInnerLow = offset2d(arrowEdgeLow,
      f * this.get('arrowInnerSkew'),
      -this.get('arrowEdgeHeight')
    );

    var tailLength = 49;
    var arrowStartUp = offset2d(arrowInnerUp, f * tailLength, 0);
    var arrowStartLow = offset2d(arrowInnerLow, f * tailLength, 0);

    var pathStr = '';
    pathStr += 'M' + toStringCoords(arrowStartUp) + ' ';
    var coords = [
      arrowInnerUp,
      arrowEdgeUp,
      arrowTip,
      arrowEdgeLow,
      arrowInnerLow,
      arrowStartLow
    ];
    _.each(coords, function(pos) {
      pathStr += 'L' + toStringCoords(pos) + ' ';
    }, this);
    pathStr += 'z';
    return pathStr;
  },

  getTextSize: function() {
    var getTextWidth = function(visBranch) {
      var textNode = (visBranch.get('text')) ? visBranch.get('text').node : null;
      return (textNode === null) ? 0 : textNode.clientWidth;
    };

    var firefoxFix = function(obj) {
      if (!obj.w) { obj.w = 75; }
      if (!obj.h) { obj.h = 20; }
      return obj;
    };

    var textNode = this.get('text').node;
    if (this.get('isHead')) {
      // HEAD is a special case
      return firefoxFix({
        w: textNode.clientWidth,
        h: textNode.clientHeight
      });
    }

    var maxWidth = 0;
    _.each(this.getBranchStackArray(), function(branch) {
      maxWidth = Math.max(maxWidth, getTextWidth(
        branch.obj.get('visBranch')
      ));
    });

    return firefoxFix({
      w: maxWidth,
      h: textNode.clientHeight
    });
  },

  getSingleRectSize: function() {
    var textSize = this.getTextSize();
    var vPad = this.get('vPad');
    var hPad = this.get('hPad');
    return {
      w: textSize.w + vPad * 2,
      h: textSize.h + hPad * 2
    };
  },

  getRectSize: function() {
    var textSize = this.getTextSize();
    // enforce padding
    var vPad = this.get('vPad');
    var hPad = this.get('hPad');

    // number of other branch names we are housing
    var totalNum = this.getBranchStackLength();
    return {
      w: textSize.w + vPad * 2,
      h: textSize.h * totalNum * 1.1 + hPad * 2
    };
  },

  getName: function() {
    var name = this.get('branch').get('id');
    var selected = this.gitEngine.HEAD.get('target').get('id');

    var add = (selected == name) ? '*' : '';
    return name + add;
  },

  nonTextToFront: function() {
    this.get('arrow').toFront();
    this.get('rect').toFront();
  },

  textToFront: function() {
    this.get('text').toFront();
  },

  textToFrontIfInStack: function() {
    if (this.getBranchStackIndex() !== 0) {
      this.get('text').toFront();
    }
  },

  getFill: function() {
    // in the easy case, just return your own fill if you are:
    // - the HEAD ref
    // - by yourself (length of 1)
    // - part of a multi branch, but your thing is hidden
    if (this.get('isHead') ||
        this.getBranchStackLength() == 1 ||
        this.getBranchStackIndex() !== 0) {
      return this.get('fill');
    }

    // woof. now it's hard, we need to blend hues...
    return this.gitVisuals.blendHuesFromBranchStack(this.getBranchStackArray());
  },

  remove: function() {
    this.removeKeys(['text', 'arrow', 'rect']);
    // also need to remove from this.gitVisuals
    this.gitVisuals.removeVisBranch(this);
  },

  genGraphics: function(paper) {
    var textPos = this.getTextPosition();
    var name = this.getName();
    var text;

    // when from a reload, we dont need to generate the text
    text = paper.text(textPos.x, textPos.y, String(name));
    text.attr({
      'font-size': 14,
      'font-family': 'Monaco, Courier, font-monospace',
      opacity: this.getTextOpacity()
    });
    this.set('text', text);

    var rectPos = this.getRectPosition();
    var sizeOfRect = this.getRectSize();
    var rect = paper
      .rect(rectPos.x, rectPos.y, sizeOfRect.w, sizeOfRect.h, 8)
      .attr(this.getAttributes().rect);
    this.set('rect', rect);

    var arrowPath = this.getArrowPath();
    var arrow = paper
      .path(arrowPath)
      .attr(this.getAttributes().arrow);
    this.set('arrow', arrow);

    this.attachClickHandlers();
    rect.toFront();
    text.toFront();
  },

  attachClickHandlers: function() {
    if (this.get('gitVisuals').options.noClick) {
      return;
    }
    var commandStr = 'git checkout ' + this.get('branch').get('id');
    var Main = require('../app');
    var objs = [this.get('rect'), this.get('text'), this.get('arrow')];

    _.each(objs, function(rObj) {
      rObj.click(function() {
        Main.getEventBaton().trigger('commandSubmitted', commandStr);
      });
      $(rObj.node).css('cursor', 'pointer');
    });
  },

  updateName: function() {
    this.get('text').attr({
      text: this.getName()
    });
  },

  getNonTextOpacity: function() {
    if (this.get('isHead')) {
      return this.gitEngine.getDetachedHead() ? 1 : 0;
    }
    return this.getBranchStackIndex() === 0 ? 1 : 0.0;
  },

  getTextOpacity: function() {
    if (this.get('isHead')) {
      return this.gitEngine.getDetachedHead() ? 1 : 0;
    }
    return 1;
  },

  getAttributes: function() {
    var nonTextOpacity = this.getNonTextOpacity();
    var textOpacity = this.getTextOpacity();
    this.updateName();

    var textPos = this.getTextPosition();
    var rectPos = this.getRectPosition();
    var rectSize = this.getRectSize();

    var arrowPath = this.getArrowPath();

    return {
      text: {
        x: textPos.x,
        y: textPos.y,
        opacity: textOpacity
      },
      rect: {
        x: rectPos.x,
        y: rectPos.y,
        width: rectSize.w,
        height: rectSize.h,
        opacity: nonTextOpacity,
        fill: this.getFill(),
        stroke: this.get('stroke'),
        'stroke-width': this.get('stroke-width')
      },
      arrow: {
        path: arrowPath,
        opacity: nonTextOpacity,
        fill: this.getFill(),
        stroke: this.get('stroke'),
        'stroke-width': this.get('stroke-width')
      }
    };
  },

  animateUpdatedPos: function(speed, easing) {
    var attr = this.getAttributes();
    this.animateToAttr(attr, speed, easing);
  },

  animateFromAttrToAttr: function(fromAttr, toAttr, speed, easing) {
    // an animation of 0 is essentially setting the attribute directly
    this.animateToAttr(fromAttr, 0);
    this.animateToAttr(toAttr, speed, easing);
  },

  animateToAttr: function(attr, speed, easing) {
    if (speed === 0) {
      this.get('text').attr(attr.text);
      this.get('rect').attr(attr.rect);
      this.get('arrow').attr(attr.arrow);
      return;
    }

    var s = speed !== undefined ? speed : this.get('animationSpeed');
    var e = easing || this.get('animationEasing');

    this.get('text').stop().animate(attr.text, s, e);
    this.get('rect').stop().animate(attr.rect, s, e);
    this.get('arrow').stop().animate(attr.arrow, s, e);
  }
});

var VisBranchCollection = Backbone.Collection.extend({
  model: VisBranch
});

exports.VisBranchCollection = VisBranchCollection;
exports.VisBranch = VisBranch;
exports.randomHueString = randomHueString;


});

require.define("/src/js/visuals/visEdge.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GRAPHICS = require('../util/constants').GRAPHICS;

var VisBase = require('../visuals/visBase').VisBase;

var VisEdge = VisBase.extend({
  defaults: {
    tail: null,
    head: null,
    animationSpeed: GRAPHICS.defaultAnimationTime,
    animationEasing: GRAPHICS.defaultEasing
  },

  validateAtInit: function() {
    var required = ['tail', 'head'];
    _.each(required, function(key) {
      if (!this.get(key)) {
        throw new Error(key + ' is required!');
      }
    }, this);
  },

  getID: function() {
    return this.get('tail').get('id') + '.' + this.get('head').get('id');
  },

  initialize: function() {
    this.validateAtInit();

    // shorthand for the main objects
    this.gitVisuals = this.get('gitVisuals');
    this.gitEngine = this.get('gitEngine');

    this.get('tail').get('outgoingEdges').push(this);
  },

  remove: function() {
    this.removeKeys(['path']);
    this.gitVisuals.removeVisEdge(this);
  },

  genSmoothBezierPathString: function(tail, head) {
    var tailPos = tail.getScreenCoords();
    var headPos = head.getScreenCoords();
    return this.genSmoothBezierPathStringFromCoords(tailPos, headPos);
  },

  genSmoothBezierPathStringFromCoords: function(tailPos, headPos) {
    // we need to generate the path and control points for the bezier. format
    // is M(move abs) C (curve to) (control point 1) (control point 2) (final point)
    // the control points have to be __below__ to get the curve starting off straight.

    var coords = function(pos) {
      return String(Math.round(pos.x)) + ',' + String(Math.round(pos.y));
    };
    var offset = function(pos, dir, delta) {
      delta = delta || GRAPHICS.curveControlPointOffset;
      return {
        x: pos.x,
        y: pos.y + delta * dir
      };
    };
    var offset2d = function(pos, x, y) {
      return {
        x: pos.x + x,
        y: pos.y + y
      };
    };

    // first offset tail and head by radii
    tailPos = offset(tailPos, -1, this.get('tail').getRadius());
    headPos = offset(headPos, 1, this.get('head').getRadius());

    var str = '';
    // first move to bottom of tail
    str += 'M' + coords(tailPos) + ' ';
    // start bezier
    str += 'C';
    // then control points above tail and below head
    str += coords(offset(tailPos, -1)) + ' ';
    str += coords(offset(headPos, 1)) + ' ';
    // now finish
    str += coords(headPos);

    // arrow head
    var delta = GRAPHICS.arrowHeadSize || 10;
    str += ' L' + coords(offset2d(headPos, -delta, delta));
    str += ' L' + coords(offset2d(headPos, delta, delta));
    str += ' L' + coords(headPos);

    // then go back, so we can fill correctly
    str += 'C';
    str += coords(offset(headPos, 1)) + ' ';
    str += coords(offset(tailPos, -1)) + ' ';
    str += coords(tailPos);

    return str;
  },

  getBezierCurve: function() {
    return this.genSmoothBezierPathString(this.get('tail'), this.get('head'));
  },

  getStrokeColor: function() {
    return GRAPHICS.visBranchStrokeColorNone;
  },

  setOpacity: function(opacity) {
    opacity = (opacity === undefined) ? 1 : opacity;

    this.get('path').attr({opacity: opacity});
  },

  genGraphics: function(paper) {
    var pathString = this.getBezierCurve();

    var path = paper.path(pathString).attr({
      'stroke-width': GRAPHICS.visBranchStrokeWidth,
      'stroke': this.getStrokeColor(),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'fill': this.getStrokeColor()
    });
    path.toBack();
    this.set('path', path);
  },

  getOpacity: function() {
    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('tail'));
    var map = {
      'branch': 1,
      'head': GRAPHICS.edgeUpstreamHeadOpacity,
      'none': GRAPHICS.edgeUpstreamNoneOpacity
    };

    if (map[stat] === undefined) { throw new Error('bad stat'); }
    return map[stat];
  },

  getAttributes: function() {
    var newPath = this.getBezierCurve();
    var opacity = this.getOpacity();
    return {
      path: {
        path: newPath,
        opacity: opacity
      }
    };
  },

  animateUpdatedPath: function(speed, easing) {
    var attr = this.getAttributes();
    this.animateToAttr(attr, speed, easing);
  },

  animateFromAttrToAttr: function(fromAttr, toAttr, speed, easing) {
    // an animation of 0 is essentially setting the attribute directly
    this.animateToAttr(fromAttr, 0);
    this.animateToAttr(toAttr, speed, easing);
  },

  animateToAttr: function(attr, speed, easing) {
    if (speed === 0) {
      this.get('path').attr(attr.path);
      return;
    }

    this.get('path').toBack();
    this.get('path').stop().animate(
      attr.path,
      speed !== undefined ? speed : this.get('animationSpeed'),
      easing || this.get('animationEasing')
    );
  }
});

var VisEdgeCollection = Backbone.Collection.extend({
  model: VisEdge
});

exports.VisEdgeCollection = VisEdgeCollection;
exports.VisEdge = VisEdge;

});

require.define("/src/js/level/disabledMap.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var GitCommands = require('../git/commands');

var Errors = require('../util/errors');
var GitError = Errors.GitError;

function DisabledMap(options) {
  options = options || {};
  this.disabledMap = options.disabledMap || {
    'git cherry-pick': true,
    'git rebase': true
  };
}

DisabledMap.prototype.getInstantCommands = function() {
  // this produces an array of regex / function pairs that can be
  // piped into a parse waterfall to disable certain git commmands
  // :D
  var instants = [];
  var onMatch = function() {
    throw new GitError({
      msg: 'That git command is disabled for this level!'
    });
  };

  _.each(this.disabledMap, function(val, disabledCommand) {
    var gitRegex = GitCommands.regexMap[disabledCommand];
    if (!gitRegex) {
      throw new Error('wuttttt this disbaled command' + disabledCommand +
        ' has no regex matching');
    }
    instants.push([gitRegex, onMatch]);
  });
  return instants;
};

exports.DisabledMap = DisabledMap;


});

require.define("/src/js/level/arbiter.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

// Each level is part of a "sequence;" levels within
// a sequence proceed in order.
var levelSequences = require('../levels').levelSequences;
var sequenceInfo = require('../levels').sequenceInfo;

var Main = require('../app');

function LevelArbiter() {
  this.levelMap = {};
  this.levelSequences = levelSequences;
  this.sequences = [];
  this.init();

  var solvedMap;
  try {
    solvedMap = JSON.parse(localStorage.getItem('solvedMap') || '{}');
  } catch (e) {
    console.warn('local storage failed', e);
    // throw e;
  }
  this.solvedMap = solvedMap || {};

  Main.getEvents().on('levelSolved', this.levelSolved, this);
}

LevelArbiter.prototype.init = function() {
  var previousLevelID;
  _.each(this.levelSequences, function(levels, levelSequenceName) {
    this.sequences.push(levelSequenceName);
    if (!levels || !levels.length) {
      throw new Error('no empty sequences allowed');
    }

    // for this particular sequence...
    _.each(levels, function(level, index) {
      this.validateLevel(level);

      var id = levelSequenceName + String(index + 1);
      var compiledLevel = _.extend(
        {},
        level,
        {
          index: index,
          id: id,
          sequenceName: levelSequenceName
        }
      );

      // update our internal data
      this.levelMap[id] = compiledLevel;
      this.levelSequences[levelSequenceName][index] = compiledLevel;
    }, this);
  }, this);
};

LevelArbiter.prototype.isLevelSolved = function(id) {
  if (!this.levelMap[id]) {
    throw new Error('that level doesnt exist!');
  }
  return Boolean(this.solvedMap[id]);
};

LevelArbiter.prototype.levelSolved = function(id) {
  // called without an id when we reset solved status
  if (!id) { return; }

  this.solvedMap[id] = true;
  this.syncToStorage();
};

LevelArbiter.prototype.resetSolvedMap = function() {
  this.solvedMap = {};
  this.syncToStorage();
  Main.getEvents().trigger('levelSolved');
};

LevelArbiter.prototype.syncToStorage = function() {
  try {
    localStorage.setItem('solvedMap', JSON.stringify(this.solvedMap));
  } catch (e) {
    console.warn('local storage fialed on set', e);
  }
};

LevelArbiter.prototype.validateLevel = function(level) {
  level = level || {};
  var requiredFields = [
    'name',
    'goalTreeString',
    //'description',
    'solutionCommand'
  ];

  var optionalFields = [
    'hint',
    'disabledMap',
    'startTree'
  ];

  _.each(requiredFields, function(field) {
    if (level[field] === undefined) {
      console.log(level);
      throw new Error('I need this field for a level: ' + field);
    }
  });
};

LevelArbiter.prototype.getSequenceToLevels = function() {
  return this.levelSequences;
};

LevelArbiter.prototype.getSequences = function() {
  return _.keys(this.levelSequences);
};

LevelArbiter.prototype.getLevelsInSequence = function(sequenceName) {
  if (!this.levelSequences[sequenceName]) {
    throw new Error('that sequecne name ' + sequenceName + 'does not exist');
  }
  return this.levelSequences[sequenceName];
};

LevelArbiter.prototype.getSequenceInfo = function(sequenceName) {
  return sequenceInfo[sequenceName];
};

LevelArbiter.prototype.getLevel = function(id) {
  return this.levelMap[id];
};

LevelArbiter.prototype.getNextLevel = function(id) {
  if (!this.levelMap[id]) {
    console.warn('that level doesnt exist!!!');
    return null;
  }

  // meh, this method could be better. It's a tradeoff between
  // having the sequence structure be really simple JSON
  // and having no connectivity information between levels, which means
  // you have to build that up yourself on every query
  var level = this.levelMap[id];
  var sequenceName = level.sequenceName;
  var sequence = this.levelSequences[sequenceName];

  var nextIndex = level.index + 1;
  if (nextIndex < sequence.length) {
    return sequence[nextIndex];
  }

  var nextSequenceIndex = this.sequences.indexOf(sequenceName) + 1;
  if (nextSequenceIndex < this.sequences.length) {
    var nextSequenceName = this.sequences[nextSequenceIndex];
    return this.levelSequences[nextSequenceName][0];
  }

  // they finished the last level!
  return null;
};

exports.LevelArbiter = LevelArbiter;


});

require.define("/src/levels/index.js",function(require,module,exports,__dirname,__filename,process,global){// Each level is part of a "sequence;" levels within
// a sequence proceed in the order listed here
exports.levelSequences = {
  intro: [
    require('../../levels/intro/1').level,
    require('../../levels/intro/2').level,
    require('../../levels/intro/3').level,
    require('../../levels/intro/4').level,
    require('../../levels/intro/5').level
  ],
  rebase: [
    require('../../levels/rebase/1').level,
    require('../../levels/rebase/2').level
  ],
  mixed: [
    require('../../levels/mixed/1').level,
    require('../../levels/mixed/2').level,
    require('../../levels/mixed/3').level
  ]
};

// there are also cute names and such for sequences
exports.sequenceInfo = {
  intro: {
    displayName: 'Introduction Sequence',
    about: 'A nicely paced introduction to the majority of git commands'
  },
  rebase: {
    displayName: 'Master the Rebase Luke!',
    about: 'What is this whole rebase hotness everyone is talking about? Find out!'
  },
  mixed: {
    displayName: 'A Mixed Bag',
    about: 'A mixed bag of Git techniques, tricks, and tips'
  }
};


});

require.define("/src/levels/intro/1.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "name": 'Introduction to Git Commits',
  "goalTreeString": "{\"branches\":{\"master\":{\"target\":\"C3\",\"id\":\"master\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git commit;git commit",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "hint": "Just type in 'git commit' twice to finish!",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Git Commits",
            "",
            "A commit in git is a recorded set of changes that you have made -- for instance, it's the 10 lines you added for a new feature or a new image added to the assets folder.",
            "",
            "Because git commits are simply *delta*'s (or changes between states) rather than entire copies of the repository, they make Git's version control quite lightweight and efficient. The days of copying your entire codebase onto an external hard drive are over!",
            "",
            "The only tricky thing is that if you want to download an entire codebase, you have to download every single commit (essentially the history of the repository) and apply them all on top of each other to get the current version. This is why you might see the command line output:",
            "",
            "```",
            "Resolving Deltas...",
            "```",
            "",
            "When you clone a git repo. Git essentially replays the entire development history on your computer in a few seconds, leaving you (at the end) with the current version of the repository!"
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's see what this looks like in practice. On the right we have a visualization of a (small) git repository. There are two commits right now -- the first initial commit, `C0`, and one commit after that `C1` that might have some meaningful changes.",
            "",
            "Hit the button below to make a new commit"
          ],
          "afterMarkdowns": [
            "There we go! Awesome. We just made changes to the repository and saved them as a commit. The commit we just made has a parent, `C1`, which references which commit it was based off of."
          ],
          "command": "git commit",
          "beforeCommand": ""
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "Go ahead and try it out on your own! After this window closes, make two commits to complete the level"
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/intro/2.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"bugFix\":{\"target\":\"C1\",\"id\":\"bugFix\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"}},\"HEAD\":{\"target\":\"bugFix\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git branch bugFix;git checkout bugFix",
  "hint": "Make a new branch with \"git branch [name]\" and check it out with \"git checkout [name]\"",
  "name": "Branching in Git",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Git Branches",
            "",
            "Branches in Git are incredibly lightweight as well. They are simply references to a specific commit -- nothing more. This is why many Git enthusiasts chant the mantra:",
            "",
            "```",
            "branch early, and branch often",
            "```",
            "",
            "Because there is no storage / memory overhead with making many branches, it's easier to logically divide up your work than have big beefy branches.",
            "",
            "When we start mixing branches and commits, we will see how these two features combine. For now though, just remember that a branch essentially says \"I want to include the work of this commit and all parent commits.\""
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's see what branches look like in practice.",
            "",
            "Here we will check out a new branch named `newImage`"
          ],
          "afterMarkdowns": [
            "There, that's all there is to branching! The branch `newImage` now refers to commit `C1`"
          ],
          "command": "git branch newImage",
          "beforeCommand": ""
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's try to put some work on this new branch. Hit the button below"
          ],
          "afterMarkdowns": [
            "Oh no! The `master` branch moved but the `newImage` branch didn't! That's because we weren't \"on\" the new branch, which is why the asterisk (*) was on `master`"
          ],
          "command": "git commit",
          "beforeCommand": "git branch newImage"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's tell git we want to checkout the branch with",
            "",
            "```",
            "git checkout [name]",
            "```",
            "",
            "This will put us on the new branch before committing our changes"
          ],
          "afterMarkdowns": [
            "There we go! Our changes were recorded on the new branch"
          ],
          "command": "git checkout newImage; git commit",
          "beforeCommand": "git branch newImage"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "Ok! You are all ready to get branching. Once this window closes,",
            "make a new branch named `bugFix` and switch to that branch"
          ]
        }
      }
    ]
  }
};
});

require.define("/src/levels/intro/3.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "{\"branches\":{\"master\":{\"target\":\"C4\",\"id\":\"master\"},\"bugFix\":{\"target\":\"C2\",\"id\":\"bugFix\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C1\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C2\",\"C3\"],\"id\":\"C4\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git checkout -b bugFix;git commit;git checkout master;git commit;git merge bugFix",
  "name": "Merging in Git",
  "hint": "Remember to commit in the order specified (bugFix before master)",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Branches and Merging",
            "",
            "Great! We now know how to commit and branch. Now we need to learn some kind of way of combining the work from two different branches together. This will allow us to branch off, develop a new feature, and then combine it back in.",
            "",
            "The first method to combine work that we will examine is `git merge`. Merging in Git creates a special commit that has two unique parents. A commit with two parents essentially means \"I want to include all the work from this parent over here and this one over here, *and* the set of all their parents.\"",
            "",
            "It's easier with visuals, let's check it out in the next view"
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Here we have two branches; each has one commit that's unique. This means that neither branch includes the entire set of \"work\" in the repository that we have done. Let's fix that with merge.",
            "",
            "We will `merge` the branch `bugFix` into `master`"
          ],
          "afterMarkdowns": [
            "Woah! See that? First of all, `master` now points to a commit that has two parents. If you follow the arrows upstream from `master`, you will hit every commit along the way to the root. This means that `master` contains all the work in the repository now.",
            "",
            "Also, see how the colors of the commits changed? To help with learning, I have included some color coordination. Each branch has a unique color. Each commit turns a color that is the blended combination of all the branches that contain that commit.",
            "",
            "So here we see that the `master` branch color is blended into all the commits, but the `bugFix` color is not. Let's fix that..."
          ],
          "command": "git merge bugFix master",
          "beforeCommand": "git checkout -b bugFix; git commit; git checkout master; git commit"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's merge `master` into `bugFix`:"
          ],
          "afterMarkdowns": [
            "Since `bugFix` was downstream of `master`, git didn't have to do any work; it simply just moved `bugFix` to the same commit `master` was attached to.",
            "",
            "Now all the commits are the same color, which means each branch contains all the work in the repository! Woohoo"
          ],
          "command": "git merge master bugFix",
          "beforeCommand": "git checkout -b bugFix; git commit; git checkout master; git commit; git merge bugFix master"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "To complete this level, do the following steps:",
            "",
            "* Make a new branch called `bugFix`",
            "* Commit once",
            "* Go back to `master` with `git checkout`",
            "* Commit another time",
            "* Merge the branch `bugFix` into `master` with `git merge`",
            "",
            "*Remember, you can always re-display this dialog with \"help level\"!*"
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/intro/4.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C3%22%2C%22id%22%3A%22master%22%7D%2C%22bugFix%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22bugFix%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C2%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22bugFix%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout -b bugFix;git commit;git checkout master;git commit;git checkout bugFix;git rebase master",
  "name": "Rebase Introduction",
  "hint": "Make sure you commit from bugFix first",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Git Rebase",
            "",
            "The second way of combining work between branches is *rebasing.* Rebasing essentially takes a set of commits, \"copies\" them, and plops them down somewhere else.",
            "",
            "While this sounds confusing, the advantage of rebasing is that it can be used to make a nice linear sequence of commits. The commit log / history of the repository will be a lot cleaner if only rebasing is allowed.",
            "",
            "Let's see it in action..."
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Here we have two branches yet again; note that the bugFix branch is currently selected (note the asterisk)",
            "",
            "We would like to move our work from bugFix directly onto the work from master. That way it woud look like these two features were developed sequentially, when in reality they were developed in parallel.",
            "",
            "Let's do that with the `git rebase` command"
          ],
          "afterMarkdowns": [
            "Awesome! Now the work from our bugFix branch is right on top of master and we have a nice linear sequence of commits.",
            "",
            "Note that the commit C3 still exists somewhere (it has a faded appearance in the tree), and C3' is the \"copy\" that we rebased onto master.",
            "",
            "The only problem is that master hasn't been updated either, let's do that now..."
          ],
          "command": "git rebase master",
          "beforeCommand": "git commit; git checkout -b bugFix C1; git commit"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Now we are checked out on the `master` branch. Let's do ahead and rebase onto `bugFix`..."
          ],
          "afterMarkdowns": [
            "There! Since `master` was downstream of `bugFix`, git simply moved the `master` branch reference forward in history."
          ],
          "command": "git rebase bugFix",
          "beforeCommand": "git commit; git checkout -b bugFix C1; git commit; git rebase master; git checkout master"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "To complete this level, do the following",
            "",
            "* Checkout a new branch named `bugFix`",
            "* Commit once",
            "* Go back to master and commit again",
            "* Check out bugFix again and rebase onto master",
            "",
            "Good luck!"
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/intro/5.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C1%22%2C%22id%22%3A%22master%22%7D%2C%22pushed%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22pushed%22%7D%2C%22local%22%3A%7B%22target%22%3A%22C1%22%2C%22id%22%3A%22local%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C2%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22pushed%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git reset HEAD~1;git checkout pushed;git revert HEAD",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"pushed\":{\"target\":\"C2\",\"id\":\"pushed\"},\"local\":{\"target\":\"C3\",\"id\":\"local\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C1\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"local\",\"id\":\"HEAD\"}}",
  "name": "Reversing Changes in Git",
  "hint": "",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Reversing Changes in Git",
            "",
            "There are many ways to reverse changes in Git. And just like committing, reversing changes in Git has both a low-level component (staging individual files or chunks) and a high-level component (how the changes are actually reversed). Our application will focus on the latter.",
            "",
            "There are two primary ways to undo changes in Git -- one is using `git reset` and the other is using `git revert`. We will look at each of these in the next dialog",
            ""
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "## Git Reset",
            "",
            "`git reset` reverts changes by moving a branch reference backwards in time to an older commit. In this sense you can think of it as \"rewriting history;\" `git reset` will move a branch backwards as if the commit had never been made in the first place.",
            "",
            "Let's see what that looks like:"
          ],
          "afterMarkdowns": [
            "Nice! Git simply moved the master branch reference back to `C1`; now our local repository is in a state as if `C2` had never happened"
          ],
          "command": "git reset HEAD~1",
          "beforeCommand": "git commit"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "## Git Revert",
            "",
            "While reseting works great for local branches on your own machine, it's method of \"rewriting history\" doesn't work for remote branches that others are using.",
            "",
            "In order to reverse changes and *share* those reversed changes with others, we need to use `git revert`. Let's see it in action"
          ],
          "afterMarkdowns": [
            "Weird, a new commit plopped down below the commit we wanted to reverse. That's because this new commit `C2'` introduces *changes* -- it just happens to introduce changes that exactly reverses the commit of `C2`.",
            "",
            "With resetting, you can push out your changes to share with others."
          ],
          "command": "git revert HEAD",
          "beforeCommand": "git commit"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "To complete this level, reverse the two most recent commits on both `local` and `pushed`.",
            "",
            "Keep in mind that `pushed` is a remote branch and `local` is a local branch -- that should help you chose your methods."
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/rebase/1.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "compareOnlyMaster": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C7%27%22%2C%22id%22%3A%22master%22%7D%2C%22bugFix%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22bugFix%22%7D%2C%22side%22%3A%7B%22target%22%3A%22C6%27%22%2C%22id%22%3A%22side%22%7D%2C%22another%22%3A%7B%22target%22%3A%22C7%27%22%2C%22id%22%3A%22another%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C4%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C4%22%7D%2C%22C5%22%3A%7B%22parents%22%3A%5B%22C4%22%5D%2C%22id%22%3A%22C5%22%7D%2C%22C6%22%3A%7B%22parents%22%3A%5B%22C5%22%5D%2C%22id%22%3A%22C6%22%7D%2C%22C7%22%3A%7B%22parents%22%3A%5B%22C5%22%5D%2C%22id%22%3A%22C7%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C4%27%22%3A%7B%22parents%22%3A%5B%22C2%27%22%5D%2C%22id%22%3A%22C4%27%22%7D%2C%22C5%27%22%3A%7B%22parents%22%3A%5B%22C4%27%22%5D%2C%22id%22%3A%22C5%27%22%7D%2C%22C6%27%22%3A%7B%22parents%22%3A%5B%22C5%27%22%5D%2C%22id%22%3A%22C6%27%22%7D%2C%22C7%27%22%3A%7B%22parents%22%3A%5B%22C6%27%22%5D%2C%22id%22%3A%22C7%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout bugFix;git rebase master;git checkout side;git rebase bugFix;git checkout another;git rebase side;git rebase another master",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C3\",\"id\":\"master\"},\"bugFix\":{\"target\":\"C2\",\"id\":\"bugFix\"},\"side\":{\"target\":\"C6\",\"id\":\"side\"},\"another\":{\"target\":\"C7\",\"id\":\"another\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C1\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C0\"],\"id\":\"C4\"},\"C5\":{\"parents\":[\"C4\"],\"id\":\"C5\"},\"C6\":{\"parents\":[\"C5\"],\"id\":\"C6\"},\"C7\":{\"parents\":[\"C5\"],\"id\":\"C7\"}},\"HEAD\":{\"target\":\"another\",\"id\":\"HEAD\"}}",
  "name": "Rebasing over 9000 times",
  "hint": "Remember, the most efficient way might be to only update master at the end...",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "### Rebasing Multiple Branches",
            "",
            "Man, we have a lot of branches going on here! Let's rebase all the work from these branches onto master.",
            "",
            "Upper management is making this a bit trickier though -- they want the commits to all be in sequential order. So this means that our final tree should show `C2`, `C3`, `C4'`, `C5'`, etc all in order.",
            "",
            "If you mess up along the way, feel free to use `reset` to start over again. Be sure to check our our solution and see if you can do it in fewer commands!"
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/rebase/2.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "compareOnlyBranches": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C5%22%2C%22id%22%3A%22master%22%7D%2C%22one%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22one%22%7D%2C%22two%22%3A%7B%22target%22%3A%22C2%27%27%22%2C%22id%22%3A%22two%22%7D%2C%22three%22%3A%7B%22target%22%3A%22C2%27%27%27%22%2C%22id%22%3A%22three%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C4%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C4%22%7D%2C%22C5%22%3A%7B%22parents%22%3A%5B%22C4%22%5D%2C%22id%22%3A%22C5%22%7D%2C%22C4%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C4%27%22%7D%2C%22C3%27%22%3A%7B%22parents%22%3A%5B%22C4%27%22%5D%2C%22id%22%3A%22C3%27%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%27%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C5%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C5%27%22%7D%2C%22C4%27%27%22%3A%7B%22parents%22%3A%5B%22C5%27%22%5D%2C%22id%22%3A%22C4%27%27%22%7D%2C%22C3%27%27%22%3A%7B%22parents%22%3A%5B%22C4%27%27%22%5D%2C%22id%22%3A%22C3%27%27%22%7D%2C%22C2%27%27%22%3A%7B%22parents%22%3A%5B%22C3%27%27%22%5D%2C%22id%22%3A%22C2%27%27%22%7D%2C%22C2%27%27%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%27%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git rebase -i HEAD~4;git branch -f master C5;git branch -f one C2';git rebase -i HEAD~4;git branch -f master C5;git branch -f two C2'';git rebase -i HEAD~4;git branch -f master C5;git branch -f three C2'''",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C5\",\"id\":\"master\"},\"one\":{\"target\":\"C1\",\"id\":\"one\"},\"two\":{\"target\":\"C1\",\"id\":\"two\"},\"three\":{\"target\":\"C1\",\"id\":\"three\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C3\"],\"id\":\"C4\"},\"C5\":{\"parents\":[\"C4\"],\"id\":\"C5\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "name": "Branch Spaghetti",
  "hint": "Make sure to do everything in the proper order! Branch one first, then two, then three",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Branch Spaghetti",
            "",
            "WOAHHHhhh Nelly! We have quite the goal to reach in this level.",
            "",
            "Here we have `master` that is a few commits ahead of branches `one` `two` and `three`. For whatever reason, we need to update these three other branches with modified versions of the last few commits on master.",
            "",
            "Branch `one` needs a re-ordering and a deletion. `two` needs pure reordering, and `three` only needs one commit!",
            "",
            "We will let you figure out how to solve this one -- make sure to check out our solution afterwards with `show solution`. "
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/mixed/1.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "compareOnlyMaster": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C4%27%22%2C%22id%22%3A%22master%22%7D%2C%22debug%22%3A%7B%22target%22%3A%22C2%22%2C%22id%22%3A%22debug%22%7D%2C%22printf%22%3A%7B%22target%22%3A%22C3%22%2C%22id%22%3A%22printf%22%7D%2C%22bugFix%22%3A%7B%22target%22%3A%22C4%27%22%2C%22id%22%3A%22bugFix%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C4%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C4%22%7D%2C%22C4%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C4%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout master;git cherry-pick C4",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"debug\":{\"target\":\"C2\",\"id\":\"debug\"},\"printf\":{\"target\":\"C3\",\"id\":\"printf\"},\"bugFix\":{\"target\":\"C4\",\"id\":\"bugFix\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C3\"],\"id\":\"C4\"}},\"HEAD\":{\"target\":\"bugFix\",\"id\":\"HEAD\"}}",
  "name": "Grabbing Just 1 Commit",
  "hint": "Remember, interactive rebase or cherry-pick is your friend here",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Locally stacked commits",
            "",
            "Here's a development situation that often happens: I'm trying to track down a bug but it is quite elusive. In order to aid in my detective work, I put in a few debug commands and a few print statements.",
            "",
            "All of these debugging / print statements are in their own branches. Finally I track down the bug, fix it, and rejoice!",
            "",
            "Only problem is that I now need to get my `bugFix` back into the `master` branch! I could simply fast-forward `master`, but then `master` would get all my debug statements."
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "This is where the magic of Git comes in. There are a few ways to do this, but the two most straightforward ways are:",
            "",
            "* `git rebase -i`",
            "* `git cherry-pick`",
            "",
            "Interactive (the `-i`) rebasing allows you to chose which commits you want to keep or discard. It also allows you to reorder commits. This can be helpful if you want to toss out some work.",
            "",
            "Cherry-picking allows you to pick individual commits and plop them down on top of `HEAD`"
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "This is a later level so we will leave it up to you to decide, but in order to complete the level, make sure `master` receives the commit that `bugFix` references."
          ]
        }
      }
    ]
  }
};

});

require.define("/src/levels/mixed/2.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "disabledMap" : {
    "git cherry-pick": true
  },
  "compareOnlyMaster": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C3%27%27%22%2C%22id%22%3A%22master%22%7D%2C%22newImage%22%3A%7B%22target%22%3A%22C2%22%2C%22id%22%3A%22newImage%22%7D%2C%22caption%22%3A%7B%22target%22%3A%22C3%27%27%22%2C%22id%22%3A%22caption%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C3%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%27%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%27%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C2%27%27%22%3A%7B%22parents%22%3A%5B%22C3%27%22%5D%2C%22id%22%3A%22C2%27%27%22%7D%2C%22C2%27%27%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%27%27%22%7D%2C%22C3%27%27%22%3A%7B%22parents%22%3A%5B%22C2%27%27%27%22%5D%2C%22id%22%3A%22C3%27%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git rebase -i HEAD~2;git commit --amend;git rebase -i HEAD~2;git rebase caption master",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"newImage\":{\"target\":\"C2\",\"id\":\"newImage\"},\"caption\":{\"target\":\"C3\",\"id\":\"caption\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"caption\",\"id\":\"HEAD\"}}",
  "name": "Juggling Commits",
  "hint": "The first command is git rebase -i HEAD~2",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Juggling Commits",
            "",
            "Here's another situation that happens quite commonly. You have some changes (`newImage`) and another set of changes (`caption`) that are related, so they are stacked on top of each other in your repository (aka one after another).",
            "",
            "The tricky thing is that sometimes you need to make a small modification to an earlier commit. In this case, design wants us to change the dimensions of `newImage` slightly, even though that commit is way back in our history!!"
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "We will overcome this difficulty by doing the following:",
            "",
            "* We will re-order the commits so the one we want to change is on top with `git rebase -i`",
            "* We will `commit --amend` to make the slight modification",
            "* Then we will re-oder the commits back to how they were previously with `git rebase -i`",
            "* Finally, we will move master to this updated part of the tree to finish the level (via your method of choosing)",
            "",
            "There are many ways to accomplish this overall goal (I see you eye-ing cherry-pick), and we will see more of them later, but for now let's focus on this technique."
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "Lastly, pay attention to the goal state here -- since we move the commits twice, they both get an apostrophe appended. One more apostrophe is added for the commit we amend, which gives us the final form of the tree "
          ]
        }
      }
    ]
  }
};


});

require.define("/src/levels/mixed/3.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C3%27%22%2C%22id%22%3A%22master%22%7D%2C%22newImage%22%3A%7B%22target%22%3A%22C2%22%2C%22id%22%3A%22newImage%22%7D%2C%22caption%22%3A%7B%22target%22%3A%22C3%22%2C%22id%22%3A%22caption%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C2%27%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%27%22%7D%2C%22C3%27%22%3A%7B%22parents%22%3A%5B%22C2%27%27%22%5D%2C%22id%22%3A%22C3%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout master;git cherry-pick C2;git commit --amend;git cherry-pick C3",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"newImage\":{\"target\":\"C2\",\"id\":\"newImage\"},\"caption\":{\"target\":\"C3\",\"id\":\"caption\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"caption\",\"id\":\"HEAD\"}}",
  "compareOnlyMaster": true,
  "name": "Juggling Commits #2",
  "hint": "Don't forget to forward master to the updated changes!",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Juggling Commits #2",
            "",
            "*If you haven't completed Juggling Commits #1 (the previous level), please do so before continuing*",
            "",
            "As you saw in the last level, we used `rebase -i` to reorder the commits. Once the commit we wanted to change was on top, we could easily --amend it and re-order back to our preferred order.",
            "",
            "The only issue here is that there is a lot of reordering going on, which can introduce rebase conflicts. Let's look at another method with `git cherry-pick`"
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Remember that git cherry-pick will plop down a commit from anywhere in the tree onto HEAD (as long as that commit isn't upstream).",
            "",
            "Here's a small refresher demo:"
          ],
          "afterMarkdowns": [
            "Nice! Let's move on"
          ],
          "command": "git cherry-pick C2",
          "beforeCommand": "git checkout -b bugFix; git commit; git checkout master; git commit"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "So in this level, let's accomplish the same objective of amending `C2` once but avoid using `rebase -i`. I'll leave it up to you to figure it out! :D"
          ]
        }
      }
    ]
  }
};

});

require.define("/src/js/views/levelDropdownView.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var KeyboardListener = require('../util/keyboard').KeyboardListener;
var Main = require('../app');

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;
var BaseView = require('../views').BaseView;

var LevelDropdownView = ContainedBase.extend({
  tagName: 'div',
  className: 'levelDropdownView box vertical',
  template: _.template($('#level-dropdown-view').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {};

    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('clickedID', _.debounce(
      _.bind(this.loadLevelID, this),
      300,
      true
    ));
    this.navEvents.on('negative', this.negative, this);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('left', this.left, this);
    this.navEvents.on('right', this.right, this);
    this.navEvents.on('up', this.up, this);
    this.navEvents.on('down', this.down, this);

    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        esc: 'negative',
        enter: 'positive'
      },
      wait: true
    });

    this.sequences = Main.getLevelArbiter().getSequences();
    this.sequenceToLevels = Main.getLevelArbiter().getSequenceToLevels();

    this.container = new ModalTerminal({
      title: 'Select a Level'
    });
    this.render();
    this.buildSequences();

    if (!options.wait) {
      this.show();
    }
  },

  positive: function() {
    if (!this.selectedID) {
      return;
    }
    this.loadLevelID(this.selectedID);
  },

  left: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.leftOrRight(-1);
  },

  leftOrRight: function(delta) {
    this.deselectIconByID(this.selectedID);
    this.selectedIndex = this.wrapIndex(this.selectedIndex + delta, this.getCurrentSequence());
    this.selectedID = this.getSelectedID();
    this.selectIconByID(this.selectedID);
  },

  right: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.leftOrRight(1);
  },

  up: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.selectedSequence = this.getPreviousSequence();
    this.downOrUp();
  },

  down: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.selectedSequence = this.getNextSequence();
    this.downOrUp();
  },

  downOrUp: function() {
    this.selectedIndex = this.boundIndex(this.selectedIndex, this.getCurrentSequence());
    this.deselectIconByID(this.selectedID);
    this.selectedID = this.getSelectedID();
    this.selectIconByID(this.selectedID);
  },

  turnOnKeyboardSelection: function() {
    if (!this.selectedID) {
      this.selectFirst();
      return true;
    }
    return false;
  },

  turnOffKeyboardSelection: function() {
    if (!this.selectedID) { return; }
    this.deselectIconByID(this.selectedID);
    this.selectedID = undefined;
    this.selectedIndex = undefined;
    this.selectedSequence = undefined;
  },

  wrapIndex: function(index, arr) {
    index = (index >= arr.length) ? 0 : index;
    index = (index < 0) ? arr.length - 1 : index;
    return index;
  },

  boundIndex: function(index, arr) {
    index = (index >= arr.length) ? arr.length - 1 : index;
    index = (index < 0) ? 0 : index;
    return index;
  },

  getNextSequence: function() {
    var current = this.getSequenceIndex(this.selectedSequence);
    var desired = this.wrapIndex(current + 1, this.sequences);
    return this.sequences[desired];
  },

  getPreviousSequence: function() {
    var current = this.getSequenceIndex(this.selectedSequence);
    var desired = this.wrapIndex(current - 1, this.sequences);
    return this.sequences[desired];
  },

  getSequenceIndex: function(name) {
    var index = this.sequences.indexOf(name);
    if (index < 0) { throw new Error('didnt find'); }
    return index;
  },

  getIndexForID: function(id) {
    return Main.getLevelArbiter().getLevel(id).index;
  },

  selectFirst: function() {
    var firstID = this.sequenceToLevels[this.sequences[0]][0].id;
    this.selectIconByID(firstID);
    this.selectedIndex = 0;
    this.selectedSequence = this.sequences[0];
  },

  getCurrentSequence: function() {
    return this.sequenceToLevels[this.selectedSequence];
  },

  getSelectedID: function() {
    return this.sequenceToLevels[this.selectedSequence][this.selectedIndex].id;
  },

  selectIconByID: function(id) {
    this.toggleIconSelect(id, true);
  },

  deselectIconByID: function(id) {
    this.toggleIconSelect(id, false);
  },

  toggleIconSelect: function(id, value) {
    this.selectedID = id;
    var selector = '#levelIcon-' + id;
    $(selector).toggleClass('selected', value);
  },

  negative: function() {
    this.hide();
  },

  testOption: function(str) {
    return this.currentCommand && new RegExp('--' + str).test(this.currentCommand.get('rawStr'));
  },

  show: function(deferred, command) {
    this.currentCommand = command;
    // doing the update on show will allow us to fade which will be nice
    this.updateSolvedStatus();

    this.showDeferred = deferred;
    this.keyboardListener.listen();
    LevelDropdownView.__super__.show.apply(this);
  },

  hide: function() {
    if (this.showDeferred) {
      this.showDeferred.resolve();
    }
    this.showDeferred = undefined;
    this.keyboardListener.mute();
    this.turnOffKeyboardSelection();

    LevelDropdownView.__super__.hide.apply(this);
  },

  loadLevelID: function(id) {
    if (!this.testOption('noOutput')) {
      Main.getEventBaton().trigger(
        'commandSubmitted',
        'level ' + id
      );
    }
    this.hide();
  },

  updateSolvedStatus: function() {
    _.each(this.seriesViews, function(view) {
      view.updateSolvedStatus();
    }, this);
  },

  buildSequences: function() {
    this.seriesViews = [];
    _.each(this.sequences, function(sequenceName) {
      this.seriesViews.push(new SeriesView({
        destination: this.$el,
        name: sequenceName,
        navEvents: this.navEvents
      }));
    }, this);
  }
});

var SeriesView = BaseView.extend({
  tagName: 'div',
  className: 'seriesView box flex1 vertical',
  template: _.template($('#series-view').html()),
  events: {
    'click div.levelIcon': 'click'
  },

  initialize: function(options) {
    this.name = options.name || 'intro';
    this.navEvents = options.navEvents;
    this.info = Main.getLevelArbiter().getSequenceInfo(this.name);
    this.levels = Main.getLevelArbiter().getLevelsInSequence(this.name);

    this.levelIDs = [];
    _.each(this.levels, function(level) {
      this.levelIDs.push(level.id);
    }, this);

    this.destination = options.destination;
    this.JSON = {
      displayName: this.info.displayName,
      about: this.info.about,
      ids: this.levelIDs
    };

    this.render();
    this.updateSolvedStatus();
  },

  updateSolvedStatus: function() {
    // this is a bit hacky, it really should be some nice model
    // property changing but it's the 11th hour...
    var toLoop = this.$('div.levelIcon').each(function(index, el) {
      var id = $(el).attr('data-id');
      $(el).toggleClass('solved', Main.getLevelArbiter().isLevelSolved(id));
    });
  },

  click: function(ev) {
    var element = ev.srcElement || ev.currentTarget;
    if (!element) {
      console.warn('wut, no id'); return;
    }

    var id = $(element).attr('data-id');
    this.navEvents.trigger('clickedID', id);
  }
});

exports.LevelDropdownView = LevelDropdownView;


});

require.define("/src/js/views/commandViews.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var CommandEntryCollection = require('../models/collections').CommandEntryCollection;
var Main = require('../app');
var Command = require('../models/commandModel').Command;
var CommandEntry = require('../models/commandModel').CommandEntry;

var Errors = require('../util/errors');
var Warning = Errors.Warning;

var util = require('../util');
var keyboard = require('../util/keyboard');

var CommandPromptView = Backbone.View.extend({
  initialize: function(options) {
    Main.getEvents().on('commandSubmittedPassive', this.addToCommandHistory, this);

    // uses local storage
    this.commands = new CommandEntryCollection();
    this.commands.fetch({
      success: _.bind(function() {
        // reverse the commands. this is ugly but needs to be done...
        var commands = [];
        this.commands.each(function(c) {
          commands.push(c);
        });

        commands.reverse();
        this.commands.reset();

        _.each(commands, function(c) {
          this.commands.add(c);
        }, this);
      }, this)
    });

    this.index = -1;
    this.commandParagraph = this.$('#prompt p.command')[0];
    this.commandCursor = this.$('#prompt span.cursor')[0];
    this.focus();

    Main.getEvents().on('rollupCommands', this.rollupCommands, this);

    Main.getEventBaton().stealBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().stealBaton('keyup', this.onKeyUp, this);
  },

  events: {
    'blur #commandTextField': 'hideCursor',
    'focus #commandTextField': 'showCursor'
  },

  blur: function() {
    this.hideCursor();
  },

  focus: function() {
    this.$('#commandTextField').focus();
    this.showCursor();
  },

  hideCursor: function() {
    this.toggleCursor(false);
  },

  showCursor: function() {
    this.toggleCursor(true);
  },

  toggleCursor: function(state) {
    $(this.commandCursor).toggleClass('shown', state);
  },

  onKeyDown: function(e) {
    var el = e.srcElement;
    this.updatePrompt(el);
  },

  onKeyUp: function(e) {
    this.onKeyDown(e);

    // we need to capture some of these events.
    var keyToFuncMap = {
      enter: _.bind(function() {
        this.submit();
      }, this),
      up: _.bind(function() {
        this.commandSelectChange(1);
      }, this),
      down: _.bind(function() {
        this.commandSelectChange(-1);
      }, this)
    };

    var key = keyboard.mapKeycodeToKey(e.which || e.keyCode);
    if (keyToFuncMap[key] !== undefined) {
      e.preventDefault();
      keyToFuncMap[key]();
      this.onKeyDown(e);
    }
  },

  badHtmlEncode: function(text) {
    return text.replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/</g,'&lt;')
      .replace(/ /g,'&nbsp;')
      .replace(/\n/g,'');
  },

  updatePrompt: function(el) {
    el = el || {};  // firefox
    // i WEEEPPPPPPpppppppppppp that this reflow takes so long. it adds this
    // super annoying delay to every keystroke... I have tried everything
    // to make this more performant. getting the srcElement from the event,
    // getting the value directly from the dom, etc etc. yet still,
    // there's a very annoying and sightly noticeable command delay.
    // try.github.com also has this, so I'm assuming those engineers gave up as
    // well...
    var text = $('#commandTextField').val();
    var val = this.badHtmlEncode(text);
    this.commandParagraph.innerHTML = val;

    // now mutate the cursor...
    this.cursorUpdate(text.length, el.selectionStart, el.selectionEnd);
    // and scroll down due to some weird bug
    Main.getEvents().trigger('commandScrollDown');
  },

  cursorUpdate: function(commandLength, selectionStart, selectionEnd) {
    if (selectionStart === undefined || selectionEnd === undefined) {
      selectionStart = commandLength - 1;
      selectionEnd = commandLength;
    }

    // 10px for monospaced font at "1" zoom
    var zoom = require('../util/zoomLevel').detectZoom();
    var widthPerChar = 10 * zoom;
    var heightPerRow = 22 * zoom;

    var widthOfParagraph = $(this.commandParagraph).width();
    var numCharsPerLine = widthOfParagraph / widthPerChar;

    var numCharsSelected = Math.min(Math.max(1, selectionEnd - selectionStart), numCharsPerLine);
    var widthOfSelection = String(numCharsSelected * widthPerChar) + 'px';

    // now for positioning
    var leftOffset = String(widthPerChar * (selectionStart % numCharsPerLine)) + 'px';
    var topOffset = String(Math.floor(selectionStart / numCharsPerLine) * heightPerRow) + 'px';

    // one reflow? :D
    $(this.commandCursor).css({
      width: widthOfSelection,
      left: leftOffset,
      top: topOffset
    });
  },

  commandSelectChange: function(delta) {
    this.index += delta;

    // if we are over / under, display blank line. yes this eliminates your
    // partially edited command, but i doubt that is much in this demo
    if (this.index >= this.commands.length || this.index < 0) {
      this.clear();
      this.index = -1;
      return;
    }

    // yay! we actually can display something
    var commandEntry = this.commands.toArray()[this.index].get('text');
    this.setTextField(commandEntry);
  },

  clearLocalStorage: function() {
    this.commands.each(function(c) {
      Backbone.sync('delete', c, function() { });
    }, this);
  },

  setTextField: function(value) {
    this.$('#commandTextField').val(value);
  },

  clear: function() {
    this.setTextField('');
  },

  submit: function() {
    var value = this.$('#commandTextField').val().replace('\n', '');
    this.clear();

    this.submitCommand(value);
    this.index = -1;
  },

  rollupCommands: function(numBack) {
    var which = this.commands.toArray().slice(1, Number(numBack) + 1);
    which.reverse();

    var str = '';
    _.each(which, function(commandEntry) {
      str += commandEntry.get('text') + ';';
    }, this);

    var rolled = new CommandEntry({text: str});
    this.commands.unshift(rolled);
    Backbone.sync('create', rolled, function() { });
  },

  addToCommandHistory: function(value) {
    // we should add the command to our local storage history
    // if it's not a blank line and this is a new command...
    // or if we edited the command in place in history
    var shouldAdd = (value.length && this.index === -1) ||
      ((value.length && this.index !== -1 &&
      this.commands.toArray()[this.index].get('text') !== value));

    if (!shouldAdd) {
      return;
    }

    var commandEntry = new CommandEntry({text: value});
    this.commands.unshift(commandEntry);

    // store to local storage
    Backbone.sync('create', commandEntry, function() { });

    // if our length is too egregious, reset
    if (this.commands.length > 100) {
      this.clearLocalStorage();
    }
  },

  submitCommand: function(value) {
    Main.getEventBaton().trigger('commandSubmitted', value);
  }
});

// This is the view for all commands -- it will represent
// their status (inqueue, processing, finished, error),
// their value ("git commit --amend"),
// and the result (either errors or warnings or whatever)
var CommandView = Backbone.View.extend({
  tagName: 'div',
  model: Command,
  template: _.template($('#command-template').html()),

  events: {
    'click': 'clicked'
  },

  clicked: function(e) {
  },

  initialize: function() {
    this.model.bind('change', this.wasChanged, this);
    this.model.bind('destroy', this.remove, this);
  },

  wasChanged: function(model, changeEvent) {
    // for changes that are just comestic, we actually only want to toggle classes
    // with jquery rather than brutally delete a html. doing so allows us
    // to nicely fade things
    var changes = changeEvent.changes;
    var changeKeys = _.keys(changes);
    if (_.difference(changeKeys, ['status']).length === 0) {
      this.updateStatus();
    } else {
      this.render();
    }
  },

  updateStatus: function() {
    var statuses = ['inqueue', 'processing', 'finished'];
    var toggleMap = {};
    _.each(statuses, function(status) {
      toggleMap[status] = false;
    });
    toggleMap[this.model.get('status')] = true;

    var query = this.$('p.commandLine');

    _.each(toggleMap, function(value, key) {
      query.toggleClass(key, value);
    });
  },

  render: function() {
    var json = _.extend(
      {
        resultType: '',
        result: '',
        formattedWarnings: this.model.getFormattedWarnings()
      },
      this.model.toJSON()
    );

    this.$el.html(this.template(json));
    return this;
  },

  remove: function() {
    $(this.el).hide();
  }
});


var CommandLineHistoryView = Backbone.View.extend({
  initialize: function(options) {
    this.collection = options.collection;

    this.collection.on('add', this.addOne, this);
    this.collection.on('reset', this.addAll, this);
    this.collection.on('all', this.render, this);

    this.collection.on('change', this.scrollDown, this);
    Main.getEvents().on('commandScrollDown', this.scrollDown, this);
    Main.getEvents().on('clearOldCommands', this.clearOldCommands, this);
  },

  addWarning: function(msg) {
    var err = new Warning({
      msg: msg
    });

    var command = new Command({
      error: err,
      rawStr: 'Warning:'
    });

    this.collection.add(command);
  },

  clearOldCommands: function() {
    // go through and get rid of every command that is "processed" or done
    var toDestroy = [];

    this.collection.each(function(command) {
      if (command.get('status') !== 'inqueue' &&
          command.get('status') !== 'processing') {
        toDestroy.push(command);
      }
    }, this);

    _.each(toDestroy, function(command) {
      command.destroy();
    }, this);
    this.scrollDown();
  },

  scrollDown: function() {
    // if commandDisplay is ever bigger than #terminal, we need to
    // add overflow-y to terminal and scroll down
    var cD = $('#commandDisplay')[0];
    var t = $('#terminal')[0];

    var shouldScroll = (cD.clientHeight > t.clientHeight);
    $(t).toggleClass('scrolling', shouldScroll);
    if (shouldScroll) {
      t.scrollTop = t.scrollHeight;
    }
  },

  addOne: function(command) {
    var view = new CommandView({
      model: command
    });
    this.$('#commandDisplay').append(view.render().el);
    this.scrollDown();
  },

  addAll: function() {
    this.collection.each(this.addOne);
  }
});

exports.CommandPromptView = CommandPromptView;
exports.CommandLineHistoryView = CommandLineHistoryView;


});

require.define("/src/js/util/zoomLevel.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var warnOnce = true;

function detectZoom() {
  /**
   * Note: this method has only been tested on Chrome
   * but seems to work. A much more elaborate library is available here:
   * https://github.com/yonran/detect-zoom
   * but seems to return a "2" zoom level for my computer (who knows)
   * so I can't use it. The ecosystem for zoom level detection is a mess
   */
  if (!window.outerWidth || !window.innerWidth) {
    if (warnOnce) {
      console.warn("Can't detect zoom level correctly :-/");
      warnOnce = false;
    }
    return 1;
  }

  return window.outerWidth / window.innerWidth;
}

var locked = true;
var setupZoomPoll = function(callback, context) {
  var currentZoom = 0;

  setInterval(function() {
    var newZoom = detectZoom();

    if (newZoom !== currentZoom) {
      // we need to wait one more before issuing callback
      // to avoid window resize issues
      if (locked) {
        locked = false;
        return;
      }

      currentZoom = newZoom;
      callback.apply(context, [newZoom]);
    } else {
      locked = true;
    }
  }, 500);
};

exports.setupZoomPoll = setupZoomPoll;
exports.detectZoom = detectZoom;


});

require.define("/src/js/dialogs/sandbox.js",function(require,module,exports,__dirname,__filename,process,global){exports.dialog = [{
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Welcome to LearnGitBranching!',
      '',
      'This application is designed to help beginners grasp ',
      'the powerful concepts behind branching when working ',
      'with git. We hope you enjoy this application and maybe ',
      'even learn something!',
      '',
      '# Attention HN!!',
      '',
      'Unfortunately this was submitted before I finished all the help ',
      'and tutorial sections, so forgive the scarcity. See the demo here:',
      '',
      '[http://pcottle.github.com/learnGitBranching/?demo](http://pcottle.github.com/learnGitBranching/?demo)'
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## The LearnGitBranching Interface',
      '',
      'There are features to use within the user interface behind ',
      'this modal dialog. A list',
      '',
      '  * git commands (to interact with git)',
      '  * level commands (to get level hints or solutions)',
      '  * sandbox commands (like this one)',
      ''
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Git commands',
      '',
      'You have a large variety of git commands available in sandbox mode. These include',
      '',
      ' * commit',
      ' * branch',
      ' * checkout',
      ' * cherry-pick',
      ' * reset',
      ' * revert',
      ' * rebase',
      ' * merge'
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Sharing is caring!',
      '',
      'Share trees with your friends via',
      '',
      ' * export tree',
      ' * import tree',
      '',
      'Have a great lesson to share? Try building a level with',
      '',
      ' * build level'
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Levels',
      '',
      'The best way to learn is with levels. Type in "levels" to get started!'
    ]
  }
}];


});

require.define("/src/js/util/mock.js",function(require,module,exports,__dirname,__filename,process,global){exports.mock = function(Constructor) {
  var dummy = {};
  var stub = function() {};

  for (var key in Constructor.prototype) {
    dummy[key] = stub;
  }
  return dummy;
};


});

require.define("/src/js/visuals/tree.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var VisBase = Backbone.Model.extend({
  removeKeys: function(keys) {
    _.each(keys, function(key) {
      if (this.get(key)) {
        this.get(key).remove();
      }
    }, this);
  },

  animateAttrKeys: function(keys, attrObj, speed, easing) {
    // either we animate a specific subset of keys or all
    // possible things we could animate
    keys = _.extend(
      {},
      {
        include: ['circle', 'arrow', 'rect', 'path', 'text'],
        exclude: []
      },
      keys || {}
    );

    var attr = this.getAttributes();

    // safely insert this attribute into all the keys we want
    _.each(keys.include, function(key) {
      attr[key] = _.extend(
        {},
        attr[key],
        attrObj
      );
    });

    _.each(keys.exclude, function(key) {
      delete attr[key];
    });

    this.animateToAttr(attr, speed, easing);
  }
});

exports.VisBase = VisBase;


});

require.define("/src/js/git/headless.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var Q = require('q');

var GitEngine = require('../git').GitEngine;
var AnimationFactory = require('../visuals/animation/animationFactory').AnimationFactory;
var GitVisuals = require('../visuals').GitVisuals;
var TreeCompare = require('../git/treeCompare').TreeCompare;
var EventBaton = require('../util/eventBaton').EventBaton;

var Collections = require('../models/collections');
var CommitCollection = Collections.CommitCollection;
var BranchCollection = Collections.BranchCollection;
var Command = require('../models/commandModel').Command;

var mock = require('../util/mock').mock;
var util = require('../util');

var HeadlessGit = function() {
  this.init();
};

HeadlessGit.prototype.init = function() {
  this.commitCollection = new CommitCollection();
  this.branchCollection = new BranchCollection();
  this.treeCompare = new TreeCompare();

  // here we mock visuals and animation factory so the git engine
  // is headless
  var animationFactory = mock(AnimationFactory);
  var gitVisuals = mock(GitVisuals);

  this.gitEngine = new GitEngine({
    collection: this.commitCollection,
    branches: this.branchCollection,
    gitVisuals: gitVisuals,
    animationFactory: animationFactory,
    eventBaton: new EventBaton()
  });
  this.gitEngine.init();
};

HeadlessGit.prototype.sendCommand = function(value) {
  util.splitTextCommand(value, function(commandStr) {
    var commandObj = new Command({
      rawStr: commandStr
    });
    this.gitEngine.dispatch(commandObj, Q.defer());
  }, this);
};

exports.HeadlessGit = HeadlessGit;


});

require.define("/src/js/app/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var Constants = require('../util/constants');
var util = require('../util');

/**
 * Globals
 */
var events = _.clone(Backbone.Events);
var commandUI;
var sandbox;
var eventBaton;
var levelArbiter;
var levelDropdown;

///////////////////////////////////////////////////////////////////////

var init = function() {
  /**
    * There is a decent amount of bootstrapping we need just to hook
    * everything up. The init() method takes on these responsibilities,
    * including but not limited to:
    *   - setting up Events and EventBaton
    *   - calling the constructor for the main visualization
    *   - initializing the command input bar
    *   - handling window.focus and zoom events
  **/
  var Sandbox = require('../level/sandbox').Sandbox;
  var Level = require('../level').Level;
  var EventBaton = require('../util/eventBaton').EventBaton;
  var LevelArbiter = require('../level/arbiter').LevelArbiter;
  var LevelDropdownView = require('../views/levelDropdownView').LevelDropdownView;

  eventBaton = new EventBaton();
  commandUI = new CommandUI();
  sandbox = new Sandbox();
  levelArbiter = new LevelArbiter();
  levelDropdown = new LevelDropdownView({
    wait: true
  });

  // we always want to focus the text area to collect input
  var focusTextArea = function() {
    $('#commandTextField').focus();
  };
  focusTextArea();

  $(window).focus(function(e) {
    eventBaton.trigger('windowFocus', e);
  });
  $(document).click(function(e) {
    eventBaton.trigger('documentClick', e);
  });
  $(document).bind('keydown', function(e) {
    eventBaton.trigger('docKeydown', e);
  });
  $(document).bind('keyup', function(e) {
    eventBaton.trigger('docKeyup', e);
  });

  $(window).on('resize', function(e) {
    events.trigger('resize', e);
  });

  $(window).on('resize', _.throttle(function(e) {
    var width = $(window).width();
    var height = $(window).height();
    eventBaton.trigger('windowSizeCheck', {w: width, h: height});
  }, 500));
  eventBaton.stealBaton('docKeydown', function() { });
  eventBaton.stealBaton('docKeyup', function() { });

  /**
    * I am disabling this for now, it works on desktop but is
      hacky on iOS mobile and god knows the behavior on android...
  // zoom level measure, I wish there was a jquery event for this :/
  require('../util/zoomLevel').setupZoomPoll(function(level) {
    eventBaton.trigger('zoomChange', level);
  }, this);

  eventBaton.stealBaton('zoomChange', function(level) {
    if (level > Constants.VIEWPORT.maxZoom ||
        level < Constants.VIEWPORT.minZoom) {
      var Views = require('../views');
      var view = new Views.ZoomAlertWindow({level: level});
    }
  });
  */

  /*
  eventBaton.stealBaton('windowSizeCheck', function(size) {
    if (size.w < Constants.VIEWPORT.minWidth ||
        size.h < Constants.VIEWPORT.minHeight) {
      var Views = require('../views');
      var view = new Views.WindowSizeAlertWindow();
    }
  });*/

  // the default action on window focus and document click is to just focus the text area
  eventBaton.stealBaton('windowFocus', focusTextArea);
  eventBaton.stealBaton('documentClick', focusTextArea);

  // but when the input is fired in the text area, we pipe that to whoever is
  // listenining
  var makeKeyListener = function(name) {
    return function() {
      var args = [name];
      _.each(arguments, function(arg) {
        args.push(arg);
      });
      eventBaton.trigger.apply(eventBaton, args);
    };
  };

  $('#commandTextField').on('keydown', makeKeyListener('keydown'));
  $('#commandTextField').on('keyup', makeKeyListener('keyup'));
  $(window).trigger('resize');

  // demo functionality
  if (/\?demo/.test(window.location.href)) {
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger(
        'commandSubmitted',
        [
          "git commit; git checkout -b bugFix C1; git commit; git merge master; git checkout master; git commit; git rebase bugFix;",
          "delay 1000; reset;",
          "level rebase1 --noFinishDialog --noStartCommand --noIntroDialog;",
          "delay 2000; show goal; delay 1000; hide goal;",
          "git checkout bugFix; git rebase master; git checkout side; git rebase bugFix;",
          "git checkout another; git rebase side; git rebase another master;",
          "help; levels"
        ].join(''));
    });
  } else if (!(/\?NODEMO/.test(window.location.href))) {
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger(
        'commandSubmitted',
        [
          "git help;",
          "delay 1000;",
          "help;",
          "levels"
        ].join(''));
    });
  }
  if (/command=/.test(window.location.href)) {
    var commandRaw = window.location.href.split('command=')[1].split('&')[0];
    var command = unescape(commandRaw);
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger('commandSubmitted', command);
    });
  }
  if (/(iPhone|iPod|iPad).*AppleWebKit/i.test(navigator.userAgent) || /android/i.test(navigator.userAgent)) {
    sandbox.mainVis.customEvents.on('gitEngineReady', function() {
      eventBaton.trigger('commandSubmitted', 'mobile alert');
    });
  }
};

if (require('../util').isBrowser()) {
  // this file gets included via node sometimes as well
  $(document).ready(init);
}

/**
  * the UI method simply bootstraps the command buffer and
  * command prompt views. It only interacts with user input
  * and simply pipes commands to the main events system
**/
function CommandUI() {
  var Collections = require('../models/collections');
  var CommandViews = require('../views/commandViews');

  this.commandCollection = new Collections.CommandCollection();
  this.commandBuffer = new Collections.CommandBuffer({
    collection: this.commandCollection
  });

  this.commandPromptView = new CommandViews.CommandPromptView({
    el: $('#commandLineBar')
  });

  this.commandLineHistoryView = new CommandViews.CommandLineHistoryView({
    el: $('#commandLineHistory'),
    collection: this.commandCollection
  });
}

exports.getEvents = function() {
  return events;
};

exports.getSandbox = function() {
  return sandbox;
};

exports.getEventBaton = function() {
  return eventBaton;
};

exports.getCommandUI = function() {
  return commandUI;
};

exports.getLevelArbiter = function() {
  return levelArbiter;
};

exports.getLevelDropdown = function() {
  return levelDropdown;
};

exports.init = init;


});
require("/src/js/app/index.js");

require.define("/src/js/dialogs/levelBuilder.js",function(require,module,exports,__dirname,__filename,process,global){exports.dialog = [{
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Welcome to the level builder!',
      '',
      'Here are the main steps:',
      '',
      '  * Set up the initial environment with git commands',
      '  * Define the starting tree with ```define start```',
      '  * Enter the series of git commands that compose the (optimal) solution',
      '  * Define the goal tree with ```define goal```. Defining the goal also defines the solution',
      '  * Optionally define a hint with ```define hint```',
      '  * Edit the name with ```define name```',
      '  * Optionally define a nice start dialog with ```edit dialog```',
      '  * Enter the command ```finish``` to output your level JSON!'
    ]
  }
}];

});
require("/src/js/dialogs/levelBuilder.js");

require.define("/src/js/dialogs/sandbox.js",function(require,module,exports,__dirname,__filename,process,global){exports.dialog = [{
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Welcome to LearnGitBranching!',
      '',
      'This application is designed to help beginners grasp ',
      'the powerful concepts behind branching when working ',
      'with git. We hope you enjoy this application and maybe ',
      'even learn something!',
      '',
      '# Attention HN!!',
      '',
      'Unfortunately this was submitted before I finished all the help ',
      'and tutorial sections, so forgive the scarcity. See the demo here:',
      '',
      '[http://pcottle.github.com/learnGitBranching/?demo](http://pcottle.github.com/learnGitBranching/?demo)'
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## The LearnGitBranching Interface',
      '',
      'There are features to use within the user interface behind ',
      'this modal dialog. A list',
      '',
      '  * git commands (to interact with git)',
      '  * level commands (to get level hints or solutions)',
      '  * sandbox commands (like this one)',
      ''
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Git commands',
      '',
      'You have a large variety of git commands available in sandbox mode. These include',
      '',
      ' * commit',
      ' * branch',
      ' * checkout',
      ' * cherry-pick',
      ' * reset',
      ' * revert',
      ' * rebase',
      ' * merge'
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Sharing is caring!',
      '',
      'Share trees with your friends via',
      '',
      ' * export tree',
      ' * import tree',
      '',
      'Have a great lesson to share? Try building a level with',
      '',
      ' * build level'
    ]
  }
}, {
  type: 'ModalAlert',
  options: {
    markdowns: [
      '## Levels',
      '',
      'The best way to learn is with levels. Type in "levels" to get started!'
    ]
  }
}];


});
require("/src/js/dialogs/sandbox.js");

require.define("/src/js/git/commands.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var Errors = require('../util/errors');
var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var shortcutMap = {
  'git commit': /^gc($|\s)/,
  'git add': /^ga($|\s)/,
  'git checkout': /^go($|\s)/,
  'git rebase': /^gr($|\s)/,
  'git branch': /^gb($|\s)/,
  'git status': /^gs($|\s)/,
  'git help': /^git$/
};

var instantCommands = [
  [/^git help($|\s)/, function() {
    var lines = [
      'Git Version PCOTTLE.1.0',
      '<br/>',
      'Usage:',
      _.escape('\t git <command> [<args>]'),
      '<br/>',
      'Supported commands:',
      '<br/>'
    ];
    var commands = GitOptionParser.prototype.getMasterOptionMap();

    // build up a nice display of what we support
    _.each(commands, function(commandOptions, command) {
      lines.push('git ' + command);
      _.each(commandOptions, function(vals, optionName) {
        lines.push('\t ' + optionName);
      }, this);
    }, this);

    // format and throw
    var msg = lines.join('\n');
    msg = msg.replace(/\t/g, '&nbsp;&nbsp;&nbsp;');
    throw new CommandResult({
      msg: msg
    });
  }]
];

var regexMap = {
  // ($|\s) means that we either have to end the string
  // after the command or there needs to be a space for options
  'git commit': /^git commit($|\s)/,
  'git add': /^git add($|\s)/,
  'git checkout': /^git checkout($|\s)/,
  'git rebase': /^git rebase($|\s)/,
  'git reset': /^git reset($|\s)/,
  'git branch': /^git branch($|\s)/,
  'git revert': /^git revert($|\s)/,
  'git log': /^git log($|\s)/,
  'git merge': /^git merge($|\s)/,
  'git show': /^git show($|\s)/,
  'git status': /^git status($|\s)/,
  'git cherry-pick': /^git cherry-pick($|\s)/
};

var parse = function(str) {
  var method;
  var options;

  // see if we support this particular command
  _.each(regexMap, function(regex, thisMethod) {
    if (regex.exec(str)) {
      options = str.slice(thisMethod.length + 1);
      method = thisMethod.slice('git '.length);
    }
  });

  if (!method) {
    return false;
  }

  // we support this command!
  // parse off the options and assemble the map / general args
  var parsedOptions = new GitOptionParser(method, options);
  return {
    toSet: {
      generalArgs: parsedOptions.generalArgs,
      supportedMap: parsedOptions.supportedMap,
      method: method,
      options: options,
      eventName: 'processGitCommand'
    }
  };
};

/**
 * GitOptionParser
 */
function GitOptionParser(method, options) {
  this.method = method;
  this.rawOptions = options;

  this.supportedMap = this.getMasterOptionMap()[method];
  if (this.supportedMap === undefined) {
    throw new Error('No option map for ' + method);
  }

  this.generalArgs = [];
  this.explodeAndSet();
}

GitOptionParser.prototype.getMasterOptionMap = function() {
  // here a value of false means that we support it, even if its just a
  // pass-through option. If the value is not here (aka will be undefined
  // when accessed), we do not support it.
  return {
    commit: {
      '--amend': false,
      '-a': false, // warning
      '-am': false, // warning
      '-m': false
    },
    status: {},
    log: {},
    add: {},
    'cherry-pick': {},
    branch: {
      '-d': false,
      '-D': false,
      '-f': false,
      '--contains': false
    },
    checkout: {
      '-b': false,
      '-B': false,
      '-': false
    },
    reset: {
      '--hard': false,
      '--soft': false // this will raise an error but we catch it in gitEngine
    },
    merge: {},
    rebase: {
      '-i': false // the mother of all options
    },
    revert: {},
    show: {}
  };
};

GitOptionParser.prototype.explodeAndSet = function() {
  // split on spaces, except when inside quotes

  var exploded = this.rawOptions.match(/('.*?'|".*?"|\S+)/g) || [];

  for (var i = 0; i < exploded.length; i++) {
    var part = exploded[i];
    if (part.slice(0,1) == '-') {
      // it's an option, check supportedMap
      if (this.supportedMap[part] === undefined) {
        throw new CommandProcessError({
          msg: 'The option "' + part + '" is not supported'
        });
      }

      // go through and include all the next args until we hit another option or the end
      var optionArgs = [];
      var next = i + 1;
      while (next < exploded.length && exploded[next].slice(0,1) != '-') {
        optionArgs.push(exploded[next]);
        next += 1;
      }
      i = next - 1;

      // **phew** we are done grabbing those. theseArgs is truthy even with an empty array
      this.supportedMap[part] = optionArgs;
    } else {
      // must be a general arg
      this.generalArgs.push(part);
    }
  }
};

exports.shortcutMap = shortcutMap;
exports.instantCommands = instantCommands;
exports.parse = parse;
exports.regexMap = regexMap;


});
require("/src/js/git/commands.js");

require.define("/src/js/git/gitShim.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');

var Main = require('../app');
var MultiView = require('../views/multiView').MultiView;

function GitShim(options) {
  options = options || {};

  // these variables are just functions called before / after for
  // simple things (like incrementing a counter)
  this.beforeCB = options.beforeCB || function() {};
  this.afterCB = options.afterCB || function() {};

  // these guys handle an optional async process before the git
  // command executes or afterwards. If there is none,
  // it just resolves the deferred immediately
  var resolveImmediately = function(deferred) {
    deferred.resolve();
  };
  this.beforeDeferHandler = options.beforeDeferHandler || resolveImmediately;
  this.afterDeferHandler = options.afterDeferHandler || resolveImmediately;
  this.eventBaton = options.eventBaton || Main.getEventBaton();
}

GitShim.prototype.insertShim = function() {
  this.eventBaton.stealBaton('processGitCommand', this.processGitCommand, this);
};

GitShim.prototype.removeShim = function() {
  this.eventBaton.releaseBaton('processGitCommand', this.processGitCommand, this);
};

GitShim.prototype.processGitCommand = function(command, deferred) {
  this.beforeCB(command);

  // ok we make a NEW deferred that will, upon resolution,
  // call our afterGitCommandProcessed. This inserts the 'after' shim
  // functionality. we give this new deferred to the eventBaton handler
  var newDeferred = Q.defer();
  newDeferred.promise
  .then(_.bind(function() {
    // give this method the original defer so it can resolve it
    this.afterGitCommandProcessed(command, deferred);
  }, this))
  .done();

  // now our shim owner might want to launch some kind of deferred beforehand, like
  // a modal or something. in order to do this, we need to defer the passing
  // of the event baton backwards, and either resolve that promise immediately or
  // give it to our shim owner.
  var passBaton = _.bind(function() {
    // punt to the previous listener
    this.eventBaton.passBatonBack('processGitCommand', this.processGitCommand, this, [command, newDeferred]);
  }, this);

  var beforeDefer = Q.defer();
  beforeDefer.promise
  .then(passBaton)
  .done();

  // if we didnt receive a defer handler in the options, this just
  // resolves immediately
  this.beforeDeferHandler(beforeDefer, command);
};

GitShim.prototype.afterGitCommandProcessed = function(command, deferred) {
  this.afterCB(command);

  // again we can't just resolve this deferred right away... our shim owner might
  // want to insert some promise functionality before that happens. so again
  // we make a defer
  var afterDefer = Q.defer();
  afterDefer.promise
  .then(function() {
    deferred.resolve();
  })
  .done();

  this.afterDeferHandler(afterDefer, command);
};

exports.GitShim = GitShim;


});
require("/src/js/git/gitShim.js");

require.define("/src/js/git/headless.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var Q = require('q');

var GitEngine = require('../git').GitEngine;
var AnimationFactory = require('../visuals/animation/animationFactory').AnimationFactory;
var GitVisuals = require('../visuals').GitVisuals;
var TreeCompare = require('../git/treeCompare').TreeCompare;
var EventBaton = require('../util/eventBaton').EventBaton;

var Collections = require('../models/collections');
var CommitCollection = Collections.CommitCollection;
var BranchCollection = Collections.BranchCollection;
var Command = require('../models/commandModel').Command;

var mock = require('../util/mock').mock;
var util = require('../util');

var HeadlessGit = function() {
  this.init();
};

HeadlessGit.prototype.init = function() {
  this.commitCollection = new CommitCollection();
  this.branchCollection = new BranchCollection();
  this.treeCompare = new TreeCompare();

  // here we mock visuals and animation factory so the git engine
  // is headless
  var animationFactory = mock(AnimationFactory);
  var gitVisuals = mock(GitVisuals);

  this.gitEngine = new GitEngine({
    collection: this.commitCollection,
    branches: this.branchCollection,
    gitVisuals: gitVisuals,
    animationFactory: animationFactory,
    eventBaton: new EventBaton()
  });
  this.gitEngine.init();
};

HeadlessGit.prototype.sendCommand = function(value) {
  util.splitTextCommand(value, function(commandStr) {
    var commandObj = new Command({
      rawStr: commandStr
    });
    this.gitEngine.dispatch(commandObj, Q.defer());
  }, this);
};

exports.HeadlessGit = HeadlessGit;


});
require("/src/js/git/headless.js");

require.define("/src/js/git/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;
var Q = require('q');

var AnimationFactoryModule = require('../visuals/animation/animationFactory');
var AnimationQueue = require('../visuals/animation').AnimationQueue;
var TreeCompare = require('./treeCompare').TreeCompare;

var Errors = require('../util/errors');
var GitError = Errors.GitError;
var CommandResult = Errors.CommandResult;

function GitEngine(options) {
  this.rootCommit = null;
  this.refs = {};
  this.HEAD = null;

  this.branchCollection = options.branches;
  this.commitCollection = options.collection;
  this.gitVisuals = options.gitVisuals;

  this.eventBaton = options.eventBaton;
  this.eventBaton.stealBaton('processGitCommand', this.dispatch, this);

  this.animationFactory = options.animationFactory ||
    new AnimationFactoryModule.AnimationFactory();

  // global variable to keep track of the options given
  // along with the command call.
  this.commandOptions = {};
  this.generalArgs = [];

  this.initUniqueID();
}

GitEngine.prototype.initUniqueID = function() {
  // backbone or something uses _.uniqueId, so we make our own here
  this.uniqueId = (function() {
    var n = 0;
    return function(prepend) {
      return prepend? prepend + n++ : n++;
    };
  })();
};

GitEngine.prototype.defaultInit = function() {
  var defaultTree = JSON.parse(unescape("%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C1%22%2C%22id%22%3A%22master%22%2C%22type%22%3A%22branch%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22type%22%3A%22commit%22%2C%22parents%22%3A%5B%5D%2C%22author%22%3A%22Peter%20Cottle%22%2C%22createTime%22%3A%22Mon%20Nov%2005%202012%2000%3A56%3A47%20GMT-0800%20%28PST%29%22%2C%22commitMessage%22%3A%22Quick%20Commit.%20Go%20Bears%21%22%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22type%22%3A%22commit%22%2C%22parents%22%3A%5B%22C0%22%5D%2C%22author%22%3A%22Peter%20Cottle%22%2C%22createTime%22%3A%22Mon%20Nov%2005%202012%2000%3A56%3A47%20GMT-0800%20%28PST%29%22%2C%22commitMessage%22%3A%22Quick%20Commit.%20Go%20Bears%21%22%2C%22id%22%3A%22C1%22%7D%7D%2C%22HEAD%22%3A%7B%22id%22%3A%22HEAD%22%2C%22target%22%3A%22master%22%2C%22type%22%3A%22general%20ref%22%7D%7D"));
  this.loadTree(defaultTree);
};

GitEngine.prototype.init = function() {
  // make an initial commit and a master branch
  this.rootCommit = this.makeCommit(null, null, {rootCommit: true});
  this.commitCollection.add(this.rootCommit);

  var master = this.makeBranch('master', this.rootCommit);
  this.HEAD = new Ref({
    id: 'HEAD',
    target: master
  });
  this.refs[this.HEAD.get('id')] = this.HEAD;

  // commit once to get things going
  this.commit();
};

GitEngine.prototype.exportTree = function() {
  // need to export all commits, their connectivity / messages, branches, and state of head.
  // this would be simple if didn't have circular structures.... :P
  // thus, we need to loop through and "flatten" our graph of objects referencing one another
  var totalExport = {
    branches: {},
    commits: {},
    HEAD: null
  };

  _.each(this.branchCollection.toJSON(), function(branch) {
    branch.target = branch.target.get('id');
    branch.visBranch = undefined;

    totalExport.branches[branch.id] = branch;
  });

  _.each(this.commitCollection.toJSON(), function(commit) {
    // clear out the fields that reference objects and create circular structure
    _.each(Commit.prototype.constants.circularFields, function(field) {
      commit[field] = undefined;
    }, this);

    // convert parents
    var parents = [];
    _.each(commit.parents, function(par) {
      parents.push(par.get('id'));
    });
    commit.parents = parents;

    totalExport.commits[commit.id] = commit;
  }, this);

  var HEAD = this.HEAD.toJSON();
  HEAD.visBranch = undefined;
  HEAD.lastTarget = HEAD.lastLastTarget = HEAD.visBranch = undefined;
  HEAD.target = HEAD.target.get('id');
  totalExport.HEAD = HEAD;

  return totalExport;
};

GitEngine.prototype.printTree = function(tree) {
  tree = tree || this.exportTree();
  TreeCompare.prototype.reduceTreeFields([tree]);

  var str = JSON.stringify(tree);
  if (/'/.test(str)) {
    // escape it to make it more copy paste friendly
    str = escape(str);
  }
  return str;
};

GitEngine.prototype.printAndCopyTree = function() {
  window.prompt('Copy the tree string below', this.printTree());
};

GitEngine.prototype.loadTree = function(tree) {
  // deep copy in case we use it a bunch
  tree = $.extend(true, {}, tree);

  // first clear everything
  this.removeAll();

  this.instantiateFromTree(tree);

  this.reloadGraphics();
  this.initUniqueID();
};

GitEngine.prototype.loadTreeFromString = function(treeString) {
  this.loadTree(JSON.parse(unescape(treeString)));
};

GitEngine.prototype.instantiateFromTree = function(tree) {
  // now we do the loading part
  var createdSoFar = {};

  _.each(tree.commits, function(commitJSON) {
    var commit = this.getOrMakeRecursive(tree, createdSoFar, commitJSON.id);
    this.commitCollection.add(commit);
  }, this);

  _.each(tree.branches, function(branchJSON) {
    var branch = this.getOrMakeRecursive(tree, createdSoFar, branchJSON.id);

    this.branchCollection.add(branch, {silent: true});
  }, this);

  var HEAD = this.getOrMakeRecursive(tree, createdSoFar, tree.HEAD.id);
  this.HEAD = HEAD;

  this.rootCommit = createdSoFar['C0'];
  if (!this.rootCommit) {
    throw new Error('Need root commit of C0 for calculations');
  }
  this.refs = createdSoFar;

  this.gitVisuals.gitReady = false;
  this.branchCollection.each(function(branch) {
    this.gitVisuals.addBranch(branch);
  }, this);
};

GitEngine.prototype.reloadGraphics = function() {
  // get the root commit
  this.gitVisuals.rootCommit = this.refs['C0'];
  // this just basically makes the HEAD branch. the head branch really should have been
  // a member of a collection and not this annoying edge case stuff... one day
  this.gitVisuals.initHeadBranch();

  // when the paper is ready
  this.gitVisuals.drawTreeFromReload();

  this.gitVisuals.refreshTreeHarsh();
};

GitEngine.prototype.getOrMakeRecursive = function(tree, createdSoFar, objID) {
  if (createdSoFar[objID]) {
    // base case
    return createdSoFar[objID];
  }

  var getType = function(tree, id) {
    if (tree.commits[id]) {
      return 'commit';
    } else if (tree.branches[id]) {
      return 'branch';
    } else if (id == 'HEAD') {
      return 'HEAD';
    }
    throw new Error("bad type for " + id);
  };

  // figure out what type
  var type = getType(tree, objID);

  if (type == 'HEAD') {
    var headJSON = tree.HEAD;
    var HEAD = new Ref(_.extend(
      tree.HEAD,
      {
        target: this.getOrMakeRecursive(tree, createdSoFar, headJSON.target)
      }
    ));
    createdSoFar[objID] = HEAD;
    return HEAD;
  }

  if (type == 'branch') {
    var branchJSON = tree.branches[objID];

    var branch = new Branch(_.extend(
      tree.branches[objID],
      {
        target: this.getOrMakeRecursive(tree, createdSoFar, branchJSON.target)
      }
    ));
    createdSoFar[objID] = branch;
    return branch;
  }

  if (type == 'commit') {
    // for commits, we need to grab all the parents
    var commitJSON = tree.commits[objID];

    var parentObjs = [];
    _.each(commitJSON.parents, function(parentID) {
      parentObjs.push(this.getOrMakeRecursive(tree, createdSoFar, parentID));
    }, this);

    var commit = new Commit(_.extend(
      commitJSON,
      {
        parents: parentObjs,
        gitVisuals: this.gitVisuals
      }
    ));
    createdSoFar[objID] = commit;
    return commit;
  }

  throw new Error('ruh rho!! unsupported tyep for ' + objID);
};

GitEngine.prototype.tearDown = function() {
  this.eventBaton.releaseBaton('processGitCommand', this.dispatch, this);
  this.removeAll();
};

GitEngine.prototype.removeAll = function() {
  this.branchCollection.reset();
  this.commitCollection.reset();
  this.refs = {};
  this.HEAD = null;
  this.rootCommit = null;

  this.gitVisuals.resetAll();
};

GitEngine.prototype.getDetachedHead = function() {
  // detached head is if HEAD points to a commit instead of a branch...
  var target = this.HEAD.get('target');
  var targetType = target.get('type');
  return targetType !== 'branch';
};

GitEngine.prototype.validateBranchName = function(name) {
  name = name.replace(/\s/g, '');
  if (!/^[a-zA-Z0-9]+$/.test(name)) {
    throw new GitError({
      msg: 'woah bad branch name!! This is not ok: ' + name
    });
  }
  if (/[hH][eE][aA][dD]/.test(name)) {
    throw new GitError({
      msg: 'branch name of "head" is ambiguous, dont name it that'
    });
  }
  if (name.length > 9) {
    name = name.slice(0, 9);
    this.command.addWarning(
      'Sorry, we need to keep branch names short for the visuals. Your branch ' +
      'name was truncated to 9 characters, resulting in ' + name
    );
  }
  return name;
};

GitEngine.prototype.makeBranch = function(id, target) {
  id = this.validateBranchName(id);
  if (this.refs[id]) {
    throw new GitError({
      msg: 'that branch id either matches a commit hash or already exists!'
    });
  }

  var branch = new Branch({
    target: target,
    id: id
  });
  this.branchCollection.add(branch);
  this.refs[branch.get('id')] = branch;
  return branch;
};

GitEngine.prototype.getHead = function() {
  return _.clone(this.HEAD);
};

GitEngine.prototype.getBranches = function() {
  var toReturn = [];
  this.branchCollection.each(function(branch) {
    toReturn.push({
      id: branch.get('id'),
      selected: this.HEAD.get('target') === branch,
      target: branch.get('target'),
      obj: branch
    });
  }, this);
  return toReturn;
};

GitEngine.prototype.printBranchesWithout = function(without) {
  var commitToBranches = this.getUpstreamBranchSet();
  var commitID = this.getCommitFromRef(without).get('id');

  var toPrint = [];
  _.each(commitToBranches[commitID], function(branchJSON) {
    branchJSON.selected = this.HEAD.get('target').get('id') == branchJSON.id;
    toPrint.push(branchJSON);
  }, this);
  this.printBranches(toPrint);
};

GitEngine.prototype.printBranches = function(branches) {
  var result = '';
  _.each(branches, function(branch) {
    result += (branch.selected ? '* ' : '') + branch.id + '\n';
  });
  throw new CommandResult({
    msg: result
  });
};

GitEngine.prototype.makeCommit = function(parents, id, options) {
  // ok we need to actually manually create commit IDs now because
  // people like nikita (thanks for finding this!) could
  // make branches named C2 before creating the commit C2
  if (!id) {
    id = this.uniqueId('C');
    while (this.refs[id]) {
      id = this.uniqueId('C');
    }
  }

  var commit = new Commit(_.extend({
      parents: parents,
      id: id,
      gitVisuals: this.gitVisuals
    },
    options || {}
  ));

  this.refs[commit.get('id')] = commit;
  this.commitCollection.add(commit);
  return commit;
};

GitEngine.prototype.acceptNoGeneralArgs = function() {
  if (this.generalArgs.length) {
    throw new GitError({
      msg: "That command accepts no general arguments"
    });
  }
};

GitEngine.prototype.validateArgBounds = function(args, lower, upper, option) {
  // this is a little utility class to help arg validation that happens over and over again
  var what = (option === undefined) ?
    'git ' + this.command.get('method') :
    this.command.get('method') + ' ' + option + ' ';
  what = 'with ' + what;

  if (args.length < lower) {
    throw new GitError({
      msg: 'I expect at least ' + String(lower) + ' argument(s) ' + what
    });
  }
  if (args.length > upper) {
    throw new GitError({
      msg: 'I expect at most ' + String(upper) + ' argument(s) ' + what
    });
  }
};

GitEngine.prototype.oneArgImpliedHead = function(args, option) {
  // for log, show, etc
  this.validateArgBounds(args, 0, 1, option);
  if (args.length === 0) {
    args.push('HEAD');
  }
};

GitEngine.prototype.twoArgsImpliedHead = function(args, option) {
  // our args we expect to be between 1 and 2
  this.validateArgBounds(args, 1, 2, option);
  // and if it's one, add a HEAD to the back
  if (args.length == 1) {
    args.push('HEAD');
  }
};

GitEngine.prototype.revertStarter = function() {
  this.validateArgBounds(this.generalArgs, 1, NaN);

  var response = this.revert(this.generalArgs);

  if (response) {
    this.animationFactory.rebaseAnimation(this.animationQueue, response, this, this.gitVisuals);
  }
};

GitEngine.prototype.revert = function(whichCommits) {
  // for each commit, we want to revert it
  var toRebase = [];
  _.each(whichCommits, function(stringRef) {
    toRebase.push(this.getCommitFromRef(stringRef));
  }, this);

  // we animate reverts now!! we use the rebase animation though so that's
  // why the terminology is like it is
  var animationResponse = {};
  animationResponse.destinationBranch = this.resolveID(toRebase[0]);
  animationResponse.toRebaseArray = toRebase.slice(0);
  animationResponse.rebaseSteps = [];

  var beforeSnapshot = this.gitVisuals.genSnapshot();
  var afterSnapshot;

  // now make a bunch of commits on top of where we are
  var base = this.getCommitFromRef('HEAD');
  _.each(toRebase, function(oldCommit) {
    var newId = this.rebaseAltID(oldCommit.get('id'));

    var newCommit = this.makeCommit([base], newId, {
        commitMessage: 'Reverting ' + this.resolveName(oldCommit) +
          ': "' + oldCommit.get('commitMessage') + '"'
    });

    base = newCommit;

    // animation stuff
    afterSnapshot = this.gitVisuals.genSnapshot();
    animationResponse.rebaseSteps.push({
      oldCommit: oldCommit,
      newCommit: newCommit,
      beforeSnapshot: beforeSnapshot,
      afterSnapshot: afterSnapshot
    });
    beforeSnapshot = afterSnapshot;
  }, this);
  // done! update our location
  this.setTargetLocation('HEAD', base);

  // animation
  return animationResponse;
};

GitEngine.prototype.resetStarter = function() {
  if (this.commandOptions['--soft']) {
    throw new GitError({
      msg: "You can't use --soft because there is no concept of stashing" +
           " changes or staging files, so you will lose your progress." +
           " Try using interactive rebasing (or just rebasing) to move commits."
    });
  }
  if (this.commandOptions['--hard']) {
    this.command.addWarning(
      'Nice! You are using --hard. The default behavior is a hard reset in ' +
      "this demo, so don't worry about specifying the option explicity"
    );
    // dont absorb the arg off of --hard
    this.generalArgs = this.generalArgs.concat(this.commandOptions['--hard']);
  }

  this.validateArgBounds(this.generalArgs, 1, 1);

  if (this.getDetachedHead()) {
    throw new GitError({
      msg: "Cant reset in detached head! Use checkout if you want to move"
    });
  }

  this.reset(this.generalArgs[0]);
};

GitEngine.prototype.reset = function(target) {
  this.setTargetLocation('HEAD', this.getCommitFromRef(target));
};

GitEngine.prototype.cherrypickStarter = function() {
  this.validateArgBounds(this.generalArgs, 1, 1);
  var newCommit = this.cherrypick(this.generalArgs[0]);

  this.animationFactory.genCommitBirthAnimation(this.animationQueue, newCommit, this.gitVisuals);
};

GitEngine.prototype.cherrypick = function(ref) {
  var commit = this.getCommitFromRef(ref);
  // check if we already have that
  var set = this.getUpstreamSet('HEAD');
  if (set[commit.get('id')]) {
    throw new GitError({
      msg: "We already have that commit in our changes history! You can't cherry-pick it " +
           "if it shows up in git log."
    });
  }

  // alter the ID slightly
  var id = this.rebaseAltID(commit.get('id'));

  // now commit with that id onto HEAD
  var newCommit = this.makeCommit([this.getCommitFromRef('HEAD')], id);
  this.setTargetLocation(this.HEAD, newCommit);
  return newCommit;
};

GitEngine.prototype.commitStarter = function() {
  this.acceptNoGeneralArgs();
  if (this.commandOptions['-am'] && (
      this.commandOptions['-a'] || this.commandOptions['-m'])) {
    throw new GitError({
      msg: "You can't have -am with another -m or -a!"
    });
  }

  var msg = null;
  var args = null;
  if (this.commandOptions['-a']) {
    this.command.addWarning('No need to add files in this demo');
  }

  if (this.commandOptions['-am']) {
    args = this.commandOptions['-am'];
    this.validateArgBounds(args, 1, 1, '-am');

    this.command.addWarning("Don't worry about adding files in this demo. I'll take " +
      "down your commit message anyways, but you can commit without a message " +
      "in this demo as well");
    msg = args[0];
  }

  if (this.commandOptions['-m']) {
    args = this.commandOptions['-m'];
    this.validateArgBounds(args, 1, 1, '-m');
    msg = args[0];
  }

  var newCommit = this.commit();
  if (msg) {
    msg = msg
      .replace(/&quot;/g, '"')
      .replace(/^"/g, '')
      .replace(/"$/g, '');

    newCommit.set('commitMessage', msg);
  }
  this.animationFactory.genCommitBirthAnimation(this.animationQueue, newCommit, this.gitVisuals);
};

GitEngine.prototype.commit = function() {
  var targetCommit = this.getCommitFromRef(this.HEAD);
  var id = null;

  // if we want to ammend, go one above
  if (this.commandOptions['--amend']) {
    targetCommit = this.resolveID('HEAD~1');
    id = this.rebaseAltID(this.getCommitFromRef('HEAD').get('id'));
  }

  var newCommit = this.makeCommit([targetCommit], id);
  if (this.getDetachedHead()) {
    this.command.addWarning('Warning!! Detached HEAD state');
  }

  this.setTargetLocation(this.HEAD, newCommit);
  return newCommit;
};

GitEngine.prototype.resolveName = function(someRef) {
  // first get the obj
  var obj = this.resolveID(someRef);
  if (obj.get('type') == 'commit') {
    return 'commit ' + obj.get('id');
  }
  if (obj.get('type') == 'branch') {
    return 'branch "' + obj.get('id') + '"';
  }
  // we are dealing with HEAD
  return this.resolveName(obj.get('target'));
};

GitEngine.prototype.resolveID = function(idOrTarget) {
  if (idOrTarget === null || idOrTarget === undefined) {
    throw new Error('Dont call this with null / undefined');
  }

  if (typeof idOrTarget !== 'string') {
    return idOrTarget;
  }
  return this.resolveStringRef(idOrTarget);
};

GitEngine.prototype.resolveStringRef = function(ref) {
  if (this.refs[ref]) {
    return this.refs[ref];
  }

  // may be something like HEAD~2 or master^^
  var relativeRefs = [
    [/^([a-zA-Z0-9]+)~(\d+)\s*$/, function(matches) {
      return parseInt(matches[2], 10);
    }],
    [/^([a-zA-Z0-9]+)(\^+)\s*$/, function(matches) {
      return matches[2].length;
    }]
  ];

  var startRef = null;
  var numBack = null;
  _.each(relativeRefs, function(config) {
    var regex = config[0];
    var parse = config[1];
    if (regex.test(ref)) {
      var matches = regex.exec(ref);
      numBack = parse(matches);
      startRef = matches[1];
    }
  }, this);

  if (!startRef) {
    throw new GitError({
      msg: 'unknown ref ' + ref
    });
  }
  if (!this.refs[startRef]) {
    throw new GitError({
      msg: 'the ref ' + startRef +' does not exist.'
    });
  }
  var commit = this.getCommitFromRef(startRef);

  return this.numBackFrom(commit, numBack);
};

GitEngine.prototype.getCommitFromRef = function(ref) {
  var start = this.resolveID(ref);

  // works for both HEAD and just a single layer. aka branch
  while (start.get('type') !== 'commit') {
    start = start.get('target');
  }
  return start;
};

GitEngine.prototype.getType = function(ref) {
  return this.resolveID(ref).get('type');
};

GitEngine.prototype.setTargetLocation = function(ref, target) {
  if (this.getType(ref) == 'commit') {
    // nothing to do
    return;
  }

  // sets whatever ref is (branch, HEAD, etc) to a target. so if
  // you pass in HEAD, and HEAD is pointing to a branch, it will update
  // the branch to that commit, not the HEAD
  ref = this.getOneBeforeCommit(ref);
  ref.set('target', target);
};

GitEngine.prototype.getUpstreamBranchSet = function() {
  // this is expensive!! so only call once in a while
  var commitToSet = {};

  var inArray = function(arr, id) {
    var found = false;
    _.each(arr, function(wrapper) {
      if (wrapper.id == id) {
        found = true;
      }
    });

    return found;
  };

  var bfsSearch = function(commit) {
    var set = [];
    var pQueue = [commit];
    while (pQueue.length) {
      var popped = pQueue.pop();
      set.push(popped.get('id'));

      if (popped.get('parents') && popped.get('parents').length) {
        pQueue = pQueue.concat(popped.get('parents'));
      }
    }
    return set;
  };

  this.branchCollection.each(function(branch) {
    var set = bfsSearch(branch.get('target'));
    _.each(set, function(id) {
      commitToSet[id] = commitToSet[id] || [];

      // only add it if it's not there, so hue blending is ok
      if (!inArray(commitToSet[id], branch.get('id'))) {
        commitToSet[id].push({
          obj: branch,
          id: branch.get('id')
        });
      }
    });
  });

  return commitToSet;
};

GitEngine.prototype.getUpstreamHeadSet = function() {
  var set = this.getUpstreamSet('HEAD');
  var including = this.getCommitFromRef('HEAD').get('id');

  set[including] = true;
  return set;
};

GitEngine.prototype.getOneBeforeCommit = function(ref) {
  // you can call this command on HEAD in detached, HEAD, or on a branch
  // and it will return the ref that is one above a commit. aka
  // it resolves HEAD to something that we can move the ref with
  var start = this.resolveID(ref);
  if (start === this.HEAD && !this.getDetachedHead()) {
    start = start.get('target');
  }
  return start;
};

GitEngine.prototype.numBackFrom = function(commit, numBack) {
  // going back '3' from a given ref is not trivial, for you might have
  // a bunch of merge commits and such. like this situation:
  //
  //      * merge master into new
  //      |\
  //      | \* commit here
  //      |* \ commit there
  //      |  |* commit here
  //      \ /
  //       | * root
  //
  //
  // hence we need to do a BFS search, with the commit date being the
  // value to sort off of (rather than just purely the level)
  if (numBack === 0) {
    return commit;
  }

  // we use a special sorting function here that
  // prefers the later commits over the earlier ones
  var sortQueue = _.bind(function(queue) {
    queue.sort(this.dateSortFunc);
  }, this);

  var pQueue = [].concat(commit.get('parents') || []);
  sortQueue(pQueue);
  numBack--;

  while (pQueue.length && numBack !== 0) {
    var popped = pQueue.shift(0);
    var parents = popped.get('parents');

    if (parents && parents.length) {
      pQueue = pQueue.concat(parents);
    }

    sortQueue(pQueue);
    numBack--;
  }

  if (numBack !== 0 || pQueue.length === 0) {
    throw new GitError({
      msg: "Sorry, I can't go that many commits back"
    });
  }
  return pQueue.shift(0);
};

GitEngine.prototype.scrapeBaseID = function(id) {
  var results = /^C(\d+)/.exec(id);

  if (!results) {
    throw new Error('regex failed on ' + id);
  }

  return 'C' + results[1];
};

GitEngine.prototype.rebaseAltID = function(id) {
  // this function alters an ID to add a quote to the end,
  // indicating that it was rebased. it also checks existence
  var regexMap = [
    [/^C(\d+)[']{0,2}$/, function(bits) {
      // this id can use another quote, so just add it
      return bits[0] + "'";
    }],
    [/^C(\d+)[']{3}$/, function(bits) {
      // here we switch from C''' to C'^4
      return bits[0].slice(0, -3) + "'^4";
    }],
    [/^C(\d+)['][\^](\d+)$/, function(bits) {
      return 'C' + String(bits[1]) + "'^" + String(Number(bits[2]) + 1);
    }]
  ];

  for (var i = 0; i < regexMap.length; i++) {
    var regex = regexMap[i][0];
    var func = regexMap[i][1];
    var results = regex.exec(id);
    if (results) {
      var newId = func(results);
      // if this id exists, continue down the rabbit hole
      if (this.refs[newId]) {
        return this.rebaseAltID(newId);
      } else {
        return newId;
      }
    }
  }
  throw new Error('could not modify the id ' + id);
};

GitEngine.prototype.idSortFunc = function(cA, cB) {
  // commit IDs can come in many forms:
  //  C4
  //  C4' (from a rebase)
  //  C4'' (from multiple rebases)
  //  C4'^3 (from a BUNCH of rebases)

  var scale = 1000;

  var regexMap = [
    [/^C(\d+)$/, function(bits) {
      // return the 4 from C4
      return scale * bits[1];
    }],
    [/^C(\d+)([']+)$/, function(bits) {
      // return the 4 from C4, plus the length of the quotes
      return scale * bits[1] + bits[2].length;
    }],
    [/^C(\d+)['][\^](\d+)$/, function(bits) {
      return scale * bits[1] + Number(bits[2]);
    }]
  ];

  var getNumToSort = function(id) {
    for (var i = 0; i < regexMap.length; i++) {
      var regex = regexMap[i][0];
      var func = regexMap[i][1];
      var results = regex.exec(id);
      if (results) {
        return func(results);
      }
    }
    throw new Error('Could not parse commit ID ' + id);
  };

  return getNumToSort(cA.get('id')) - getNumToSort(cB.get('id'));
};

GitEngine.prototype.dateSortFunc = function(cA, cB) {
  var dateA = new Date(cA.get('createTime'));
  var dateB = new Date(cB.get('createTime'));
  if (dateA - dateB === 0) {
    // hmmmmm this still needs fixing. we need to know basically just WHEN a commit was created, but since
    // we strip off the date creation field, when loading a tree from string this fails :-/
    // there's actually no way to determine it...
    //console.warn('WUT it is equal');
    //console.log(cA, cB);
    return GitEngine.prototype.idSortFunc(cA, cB);
  }
  return dateA - dateB;
};

GitEngine.prototype.rebaseInteractiveStarter = function() {
  var args = this.commandOptions['-i'];
  this.twoArgsImpliedHead(args, ' -i');

  this.rebaseInteractive(args[0], args[1]);
};

GitEngine.prototype.rebaseStarter = function() {
  if (this.commandOptions['-i']) {
    this.rebaseInteractiveStarter();
    return;
  }

  this.twoArgsImpliedHead(this.generalArgs);

  var response = this.rebase(this.generalArgs[0], this.generalArgs[1]);

  if (response === undefined) {
    // was a fastforward or already up to date. returning now
    // will trigger the refresh animation by not adding anything to
    // the animation queue
    return;
  }

  this.animationFactory.rebaseAnimation(this.animationQueue, response, this, this.gitVisuals);
};

GitEngine.prototype.rebase = function(targetSource, currentLocation) {
  // first some conditions
  if (this.isUpstreamOf(targetSource, currentLocation)) {
    this.command.setResult('Branch already up-to-date');

    // git for some reason always checks out the branch you are rebasing,
    // no matter the result of the rebase
    this.checkout(currentLocation);

    // returning instead of throwing makes a tree refresh
    return;
  }

  if (this.isUpstreamOf(currentLocation, targetSource)) {
    // just set the target of this current location to the source
    this.setTargetLocation(currentLocation, this.getCommitFromRef(targetSource));
    // we need the refresh tree animation to happen, so set the result directly
    // instead of throwing
    this.command.setResult('Fast-forwarding...');

    this.checkout(currentLocation);
    return;
  }

   // now the part of actually rebasing.
  // We need to get the downstream set of targetSource first.
  // then we BFS from currentLocation, using the downstream set as our stopping point.
  // we need to BFS because we need to include all commits below
  // pop these commits on top of targetSource and modify their ids with quotes
  var stopSet = this.getUpstreamSet(targetSource);

  // now BFS from here on out
  var toRebaseRough = [];
  var pQueue = [this.getCommitFromRef(currentLocation)];

  while (pQueue.length) {
    var popped = pQueue.pop();

    // if its in the set, dont add it
    if (stopSet[popped.get('id')]) {
      continue;
    }

    // it's not in the set, so we need to rebase this commit
    toRebaseRough.push(popped);
    toRebaseRough.sort(this.dateSortFunc);

    // keep searching
    pQueue = pQueue.concat(popped.get('parents'));
  }

  return this.rebaseFinish(toRebaseRough, stopSet, targetSource, currentLocation);
};

GitEngine.prototype.rebaseInteractive = function(targetSource, currentLocation) {
  // there are a reduced set of checks now, so we can't exactly use parts of the rebase function
  // but it will look similar.

  // first if we are upstream of the target
  if (this.isUpstreamOf(currentLocation, targetSource)) {
    throw new GitError({
      msg: 'Nothing to do... (git throws a "noop" status here); ' +
        'Your source is upstream of your rebase target'
    });
  }

  // now get the stop set
  var stopSet = this.getUpstreamSet(targetSource);

  var toRebaseRough = [];
  // standard BFS
  var pQueue = [this.getCommitFromRef(currentLocation)];

  while (pQueue.length) {
    var popped = pQueue.pop();

    if (stopSet[popped.get('id')]) {
      continue;
    }

    toRebaseRough.push(popped);
    pQueue = pQueue.concat(popped.get('parents'));
    pQueue.sort(this.dateSortFunc);
  }

  // throw out merge's real fast and see if we have anything to do
  var toRebase = [];
  _.each(toRebaseRough, function(commit) {
    if (commit.get('parents').length == 1) {
      toRebase.push(commit);
    }
  });

  if (!toRebase.length) {
    throw new GitError({
      msg: 'No commits to rebase! Everything is a merge commit'
    });
  }

  // now do stuff :D since all our validation checks have passed, we are going to defer animation
  // and actually launch the dialog
  this.animationQueue.set('defer', true);

  var deferred = Q.defer();
  deferred.promise
  .then(_.bind(function(userSpecifiedRebase) {
    // first, they might have dropped everything (annoying)
    if (!userSpecifiedRebase.length) {
      throw new CommandResult({
        msg: 'Nothing to do...'
      });
    }

    // finish the rebase crap and animate!
    var animationData = this.rebaseFinish(userSpecifiedRebase, {}, targetSource, currentLocation);
    this.animationFactory.rebaseAnimation(this.animationQueue, animationData, this, this.gitVisuals);
    this.animationQueue.start();
  }, this))
  .fail(_.bind(function(err) {
    this.filterError(err);
    this.command.set('error', err);
    this.animationQueue.start();
  }, this))
  .done();

  var InteractiveRebaseView = require('../views/rebaseView').InteractiveRebaseView;
  // interactive rebase view will reject or resolve our promise
  new InteractiveRebaseView({
    deferred: deferred,
    toRebase: toRebase
  });
};

GitEngine.prototype.rebaseFinish = function(toRebaseRough, stopSet, targetSource, currentLocation) {
  // now we have the all the commits between currentLocation and the set of target to rebase.
  var animationResponse = {};
  animationResponse.destinationBranch = this.resolveID(targetSource);

  // we need to throw out merge commits
  var toRebase = [];
  _.each(toRebaseRough, function(commit) {
    if (commit.get('parents').length == 1) {
      toRebase.push(commit);
    }
  });

  // we ALSO need to throw out commits that will do the same changes. like
  // if the upstream set has a commit C4 and we have C4', we dont rebase the C4' again.
  // get this by doing ID scraping
  var changesAlreadyMade = {};
  _.each(stopSet, function(val, key) {
    changesAlreadyMade[this.scrapeBaseID(key)] = val; // val == true
  }, this);

  // now get rid of the commits that will redo same changes
  toRebaseRough = toRebase;
  toRebase = [];
  _.each(toRebaseRough, function(commit) {
    var baseID = this.scrapeBaseID(commit.get('id'));
    if (!changesAlreadyMade[baseID]) {
      toRebase.push(commit);
    }
  }, this);

  toRebaseRough = toRebase;
  toRebase = [];
  // finally, make the set unique
  var uniqueIDs = {};
  _.each(toRebaseRough, function(commit) {
    if (uniqueIDs[commit.get('id')]) { return; }

    uniqueIDs[commit.get('id')] = true;
    toRebase.push(commit);
  }, this);

  if (!toRebase.length) {
    throw new GitError({
      msg: 'No Commits to Rebase! Everything else is merge commits or changes already have been applied'
    });
  }

  animationResponse.toRebaseArray = toRebase.slice(0);

  // now pop all of these commits onto targetLocation
  var base = this.getCommitFromRef(targetSource);

  // do the rebase, and also maintain all our animation info during this
  animationResponse.rebaseSteps = [];
  var beforeSnapshot = this.gitVisuals.genSnapshot();
  var afterSnapshot;
  _.each(toRebase, function(old) {
    var newId = this.rebaseAltID(old.get('id'));

    var newCommit = this.makeCommit([base], newId);
    base = newCommit;

    // animation info
    afterSnapshot = this.gitVisuals.genSnapshot();
    animationResponse.rebaseSteps.push({
      oldCommit: old,
      newCommit: newCommit,
      beforeSnapshot: beforeSnapshot,
      afterSnapshot: afterSnapshot
    });
    beforeSnapshot = afterSnapshot;
  }, this);

  if (this.resolveID(currentLocation).get('type') == 'commit') {
    // we referenced a commit like git rebase C2 C1, so we have
    // to manually check out C1'

    var steps = animationResponse.rebaseSteps;
    var newestCommit = steps[steps.length - 1].newCommit;

    this.checkout(newestCommit);
  } else {
    // now we just need to update the rebased branch is
    this.setTargetLocation(currentLocation, base);
    this.checkout(currentLocation);
  }

  // for animation
  return animationResponse;
};

GitEngine.prototype.mergeStarter = function() {
  this.twoArgsImpliedHead(this.generalArgs);

  var newCommit = this.merge(this.generalArgs[0], this.generalArgs[1]);

  if (newCommit === undefined) {
    // its just a fast forwrard
    this.animationFactory.refreshTree(this.animationQueue, this.gitVisuals);
    return;
  }

  this.animationFactory.genCommitBirthAnimation(this.animationQueue, newCommit, this.gitVisuals);
};

GitEngine.prototype.merge = function(targetSource, currentLocation) {
  // first some conditions
  if (this.isUpstreamOf(targetSource, currentLocation) ||
      this.getCommitFromRef(targetSource) === this.getCommitFromRef(currentLocation)) {
    throw new CommandResult({
      msg: 'Branch already up-to-date'
    });
  }

  if (this.isUpstreamOf(currentLocation, targetSource)) {
    // just set the target of this current location to the source
    this.setTargetLocation(currentLocation, this.getCommitFromRef(targetSource));
    // get fresh animation to happen
    this.command.setResult('Fast-forwarding...');
    return;
  }

  // now the part of making a merge commit
  var parent1 = this.getCommitFromRef(currentLocation);
  var parent2 = this.getCommitFromRef(targetSource);

  // we need a fancy commit message
  var msg = 'Merge ' + this.resolveName(targetSource) +
    ' into ' + this.resolveName(currentLocation);

  // since we specify parent 1 as the first parent, it is the "main" parent
  // and the node will be displayed below that branch / commit / whatever
  var mergeCommit = this.makeCommit(
    [parent1, parent2],
    null,
    {
      commitMessage: msg
    }
  );

  this.setTargetLocation(currentLocation, mergeCommit);
  return mergeCommit;
};

GitEngine.prototype.checkoutStarter = function() {
  var args = null;
  if (this.commandOptions['-b']) {
    if (this.generalArgs.length) {
      throw new GitError({
        msg: "I don't expect general args before -b!"
      });
    }

    // the user is really trying to just make a branch and then switch to it. so first:
    args = this.commandOptions['-b'];
    this.twoArgsImpliedHead(args, '-b');

    var validId = this.validateBranchName(args[0]);
    this.branch(validId, args[1]);
    this.checkout(validId);
    return;
  }

  if (this.commandOptions['-']) {
    // get the heads last location
    var lastPlace = this.HEAD.get('lastLastTarget');
    if (!lastPlace) {
      throw new GitError({
        msg: 'Need a previous location to do - switching'
      });
    }
    this.HEAD.set('target', lastPlace);
    return;
  }

  if (this.commandOptions['-B']) {
    args = this.commandOptions['-B'];
    this.twoArgsImpliedHead(args, '-B');

    this.forceBranch(args[0], args[1]);
    this.checkout(args[0]);
    return;
  }

  this.validateArgBounds(this.generalArgs, 1, 1);

  this.checkout(this.unescapeQuotes(this.generalArgs[0]));
};

GitEngine.prototype.checkout = function(idOrTarget) {
  var target = this.resolveID(idOrTarget);
  if (target.get('id') === 'HEAD') {
    // git checkout HEAD is a
    // meaningless command but i used to do this back in the day
    return;
  }

  var type = target.get('type');
  if (type !== 'branch' && type !== 'commit') {
    throw new GitError({
      msg: 'can only checkout branches and commits!'
    });
  }

  this.HEAD.set('target', target);
};

GitEngine.prototype.branchStarter = function() {
  var args = null;
  // handle deletion first
  if (this.commandOptions['-d'] || this.commandOptions['-D']) {
    var names = this.commandOptions['-d'] || this.commandOptions['-D'];
    this.validateArgBounds(names, 1, NaN, '-d');

    _.each(names, function(name) {
      this.deleteBranch(name);
    }, this);
    return;
  }

  if (this.commandOptions['--contains']) {
    args = this.commandOptions['--contains'];
    this.validateArgBounds(args, 1, 1, '--contains');
    this.printBranchesWithout(args[0]);
    return;
  }

  if (this.commandOptions['-f']) {
    args = this.commandOptions['-f'];
    this.twoArgsImpliedHead(args, '-f');

    // we want to force a branch somewhere
    this.forceBranch(args[0], args[1]);
    return;
  }


  if (this.generalArgs.length === 0) {
    this.printBranches(this.getBranches());
    return;
  }

  this.twoArgsImpliedHead(this.generalArgs);
  this.branch(this.generalArgs[0], this.generalArgs[1]);
};

GitEngine.prototype.forceBranch = function(branchName, where) {
  // if branchname doesn't exist...
  if (!this.refs[branchName]) {
    this.branch(branchName, where);
  }

  var branch = this.resolveID(branchName);
  if (branch.get('type') !== 'branch') {
    throw new GitError({
      msg: "Can't force move anything but a branch!!"
    });
  }

  var whereCommit = this.getCommitFromRef(where);

  this.setTargetLocation(branch, whereCommit);
};

GitEngine.prototype.branch = function(name, ref) {
  var target = this.getCommitFromRef(ref);
  this.makeBranch(name, target);
};

GitEngine.prototype.deleteBranch = function(name) {
  // trying to delete, lets check our refs
  var target = this.resolveID(name);
  if (target.get('type') !== 'branch') {
    throw new GitError({
      msg: "You can't delete things that arent branches with branch command"
    });
  }
  if (target.get('id') == 'master') {
    throw new GitError({
      msg: "You can't delete the master branch!"
    });
  }
  if (this.HEAD.get('target') === target) {
    throw new GitError({
      msg: "Cannot delete the branch you are currently on"
    });
  }

  // now we know it's a branch
  var branch = target;

  this.branchCollection.remove(branch);
  this.refs[branch.get('id')] = undefined;
  delete this.refs[branch.get('id')];

  if (branch.get('visBranch')) {
    branch.get('visBranch').remove();
  }
};

GitEngine.prototype.unescapeQuotes = function(str) {
  return str.replace(/&#x27;/g, "'");
};

GitEngine.prototype.filterError = function(err) {
 if (!(err instanceof GitError ||
      err instanceof CommandResult)) {
    throw err;
  }
};

GitEngine.prototype.dispatch = function(command, deferred) {
  // current command, options, and args are stored in the gitEngine
  // for easy reference during processing.
  this.command = command;
  this.commandOptions = command.get('supportedMap');
  this.generalArgs = command.get('generalArgs');

  // set up the animation queue
  var whenDone = _.bind(function() {
    command.finishWith(deferred);
  }, this);
  this.animationQueue = new AnimationQueue({
    callback: whenDone
  });

  try {
    var methodName = command.get('method').replace(/-/g, '') + 'Starter';
    this[methodName]();
  } catch (err) {
    this.filterError(err);
    // short circuit animation by just setting error and returning
    command.set('error', err);
    deferred.resolve();
    return;
  }

  // only add the refresh if we didn't do manual animations
  if (!this.animationQueue.get('animations').length && !this.animationQueue.get('defer')) {
    this.animationFactory.refreshTree(this.animationQueue, this.gitVisuals);
  }

  // animation queue will call the callback when its done
  if (!this.animationQueue.get('defer')) {
    this.animationQueue.start();
  }
};

GitEngine.prototype.showStarter = function() {
  this.oneArgImpliedHead(this.generalArgs);

  this.show(this.generalArgs[0]);
};

GitEngine.prototype.show = function(ref) {
  var commit = this.getCommitFromRef(ref);

  throw new CommandResult({
    msg: commit.getShowEntry()
  });
};

GitEngine.prototype.statusStarter = function() {
  var lines = [];
  if (this.getDetachedHead()) {
    lines.push('Detached Head!');
  } else {
    var branchName = this.HEAD.get('target').get('id');
    lines.push('On branch ' + branchName);
  }
  lines.push('Changes to be committed:');
  lines.push('');
  lines.push('&nbsp;&nbsp;&nbsp; modified: cal/OskiCostume.stl');
  lines.push('');
  lines.push('Ready to commit! (as always in this demo)');

  var msg = '';
  _.each(lines, function(line) {
    msg += '# ' + line + '\n';
  });

  throw new CommandResult({
    msg: msg
  });
};

GitEngine.prototype.logStarter = function() {
  if (this.generalArgs.length == 2) {
    // do fancy git log branchA ^branchB
    if (this.generalArgs[1][0] == '^') {
      this.logWithout(this.generalArgs[0], this.generalArgs[1]);
    } else {
      throw new GitError({
        msg: 'I need a not branch (^branchName) when getting two arguments!'
      });
    }
  }

  this.oneArgImpliedHead(this.generalArgs);
  this.log(this.generalArgs[0]);
};

GitEngine.prototype.logWithout = function(ref, omitBranch) {
  // slice off the ^branch
  omitBranch = omitBranch.slice(1);
  this.log(ref, this.getUpstreamSet(omitBranch));
};

GitEngine.prototype.log = function(ref, omitSet) {
  // omit set is for doing stuff like git log branchA ^branchB
  omitSet = omitSet || {};
  // first get the commit we referenced
  var commit = this.getCommitFromRef(ref);

  // then get as many far back as we can from here, order by commit date
  var toDump = [];
  var pQueue = [commit];

  var seen = {};

  while (pQueue.length) {
    var popped = pQueue.shift(0);
    if (seen[popped.get('id')] || omitSet[popped.get('id')]) {
      continue;
    }
    seen[popped.get('id')] = true;

    toDump.push(popped);

    if (popped.get('parents') && popped.get('parents').length) {
      pQueue = pQueue.concat(popped.get('parents'));
    }
  }

  // now go through and collect logs
  var bigLogStr = '';
  _.each(toDump, function(c) {
    bigLogStr += c.getLogEntry();
  }, this);

  throw new CommandResult({
    msg: bigLogStr
  });
};

GitEngine.prototype.addStarter = function() {
  throw new CommandResult({
    msg: "This demo is meant to demonstrate git branching, so don't worry about " +
         "adding / staging files. Just go ahead and commit away!"
  });
};

GitEngine.prototype.getCommonAncestor = function(ancestor, cousin) {
  if (this.isUpstreamOf(cousin, ancestor)) {
    throw new Error('Dont use common ancestor if we are upstream!');
  }

  var upstreamSet = this.getUpstreamSet(ancestor);
  // now BFS off of cousin until you find something

  var queue = [this.getCommitFromRef(cousin)];
  while (queue.length) {
    var here = queue.pop();
    if (upstreamSet[here.get('id')]) {
      return here;
    }
    queue = queue.concat(here.get('parents'));
  }
  throw new Error('something has gone very wrong... two nodes arent connected!');
};

GitEngine.prototype.isUpstreamOf = function(child, ancestor) {
  child = this.getCommitFromRef(child);

  // basically just do a completely BFS search on ancestor to the root, then
  // check for membership of child in that set of explored nodes
  var upstream = this.getUpstreamSet(ancestor);
  return upstream[child.get('id')] !== undefined;
};

GitEngine.prototype.getUpstreamSet = function(ancestor) {
  var commit = this.getCommitFromRef(ancestor);
  var ancestorID = commit.get('id');
  var queue = [commit];

  var exploredSet = {};
  exploredSet[ancestorID] = true;

  var addToExplored = function(rent) {
    exploredSet[rent.get('id')] = true;
    queue.push(rent);
  };

  while (queue.length) {
    var here = queue.pop();
    var rents = here.get('parents');

    _.each(rents, addToExplored);
  }
  return exploredSet;
};


var Ref = Backbone.Model.extend({
  initialize: function() {
    if (!this.get('target')) {
      throw new Error('must be initialized with target');
    }
    if (!this.get('id')) {
      throw new Error('must be given an id');
    }
    this.set('type', 'general ref');

    if (this.get('id') == 'HEAD') {
      this.set('lastLastTarget', null);
      this.set('lastTarget', this.get('target'));
      // have HEAD remember where it is for checkout -
      this.on('change:target', this.targetChanged, this);
    }
  },

  targetChanged: function(model, targetValue, ev) {
    // push our little 3 stack back. we need to do this because
    // backbone doesn't give you what the value WAS, only what it was changed
    // TO
    this.set('lastLastTarget', this.get('lastTarget'));
    this.set('lastTarget', targetValue);
  },

  toString: function() {
    return 'a ' + this.get('type') + 'pointing to ' + String(this.get('target'));
  }
});

var Branch = Ref.extend({
  defaults: {
    visBranch: null
  },

  initialize: function() {
    Ref.prototype.initialize.call(this);
    this.set('type', 'branch');
  }
});

var Commit = Backbone.Model.extend({
  defaults: {
    type: 'commit',
    children: null,
    parents: null,
    author: 'Peter Cottle',
    createTime: null,
    commitMessage: null,
    visNode: null,
    gitVisuals: null
  },

  constants: {
    circularFields: ['gitVisuals', 'visNode', 'children']
  },

  getLogEntry: function() {
    // for now we are just joining all these things with newlines which
    // will get placed by paragraph tags. Not really a fan of this, but
    // it's better than making an entire template and all that jazz
    return [
      'Author: ' + this.get('author'),
      'Date: ' + this.get('createTime'),
      '<br/>',
      this.get('commitMessage'),
      '<br/>',
      'Commit: ' + this.get('id')
    ].join('\n' ) + '\n';
  },

  getShowEntry: function() {
    // same deal as above, show log entry and some fake changes
    return [
      this.getLogEntry(),
      'diff --git a/bigGameResults.html b/bigGameResults.html',
      '--- bigGameResults.html',
      '+++ bigGameResults.html',
      '@@ 13,27 @@ Winner, Score',
      '- Stanfurd, 14-7',
      '+ Cal, 21-14'
    ].join('\n') + '\n';
  },

  validateAtInit: function() {
    if (!this.get('id')) {
      throw new Error('Need ID!!');
    }

    if (!this.get('createTime')) {
      this.set('createTime', new Date().toString());
    }
    if (!this.get('commitMessage')) {
      this.set('commitMessage', 'Quick Commit. Go Bears!');
    }

    this.set('children', []);

    // root commits have no parents
    if (!this.get('rootCommit')) {
      if (!this.get('parents') || !this.get('parents').length) {
        throw new Error('needs parents');
      }
    }
  },

  addNodeToVisuals: function() {
    var visNode = this.get('gitVisuals').addNode(this.get('id'), this);
    this.set('visNode', visNode);
  },

  addEdgeToVisuals: function(parent) {
    this.get('gitVisuals').addEdge(this.get('id'), parent.get('id'));
  },

  isMainParent: function(parent) {
    var index = this.get('parents').indexOf(parent);
    return index === 0;
  },

  initialize: function(options) {
    this.validateAtInit();
    this.addNodeToVisuals();

    _.each(this.get('parents'), function(parent) {
      parent.get('children').push(this);
      this.addEdgeToVisuals(parent);
    }, this);
  }
});

exports.GitEngine = GitEngine;
exports.Commit = Commit;
exports.Branch = Branch;
exports.Ref = Ref;


});
require("/src/js/git/index.js");

require.define("/src/js/git/treeCompare.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

// static class...
function TreeCompare() {

}

TreeCompare.prototype.compareAllBranchesWithinTreesAndHEAD = function(treeA, treeB) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);

  return treeA.HEAD.target == treeB.HEAD.target && this.compareAllBranchesWithinTrees(treeA, treeB);
};

TreeCompare.prototype.compareAllBranchesWithinTrees = function(treeA, treeB) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);

  var allBranches = _.extend(
    {},
    treeA.branches,
    treeB.branches
  );

  var result = true;
  _.uniq(allBranches, function(info, branch) {
    result = result && this.compareBranchWithinTrees(treeA, treeB, branch);
  }, this);
  return result;
};

TreeCompare.prototype.compareBranchesWithinTrees = function(treeA, treeB, branches) {
  var result = true;
  _.each(branches, function(branchName) {
    result = result && this.compareBranchWithinTrees(treeA, treeB, branchName);
  }, this);

  return result;
};

TreeCompare.prototype.getRecurseCompare = function(treeA, treeB) {
  // we need a recursive comparison function to bubble up the  branch
  var recurseCompare = function(commitA, commitB) {
    // this is the short-circuit base case
    var result = _.isEqual(commitA, commitB);
    if (!result) {
      return false;
    }

    // we loop through each parent ID. we sort the parent ID's beforehand
    // so the index lookup is valid
    _.each(commitA.parents, function(pAid, index) {
      var pBid = commitB.parents[index];

      var childA = treeA.commits[pAid];
      var childB = treeB.commits[pBid];

      result = result && recurseCompare(childA, childB);
    }, this);
    // if each of our children recursively are equal, we are good
    return result;
  };
  return recurseCompare;
};

TreeCompare.prototype.compareBranchWithinTrees = function(treeA, treeB, branchName) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);
  this.reduceTreeFields([treeA, treeB]);

  var recurseCompare = this.getRecurseCompare(treeA, treeB);
  var branchA = treeA.branches[branchName];
  var branchB = treeB.branches[branchName];

  return _.isEqual(branchA, branchB) &&
    recurseCompare(treeA.commits[branchA.target], treeB.commits[branchB.target]);
};

TreeCompare.prototype.convertTreeSafe = function(tree) {
  if (typeof tree == 'string') {
    return JSON.parse(unescape(tree));
  }
  return tree;
};

TreeCompare.prototype.reduceTreeFields = function(trees) {
  var commitSaveFields = [
    'parents',
    'id',
    'rootCommit'
  ];
  var commitSortFields = ['children', 'parents'];
  var branchSaveFields = [
    'target',
    'id'
  ];

  // this function saves only the specified fields of a tree
  var saveOnly = function(tree, treeKey, saveFields, sortFields) {
    var objects = tree[treeKey];
    _.each(objects, function(obj, objKey) {
      // our blank slate to copy over
      var blank = {};
      _.each(saveFields, function(field) {
        if (obj[field] !== undefined) {
          blank[field] = obj[field];
        }
      });

      _.each(sortFields, function(field) {
        // also sort some fields
        if (obj[field]) {
          obj[field].sort();
          blank[field] = obj[field];
        }
      });
      tree[treeKey][objKey] = blank;
    });
  };

  _.each(trees, function(tree) {
    saveOnly(tree, 'commits', commitSaveFields, commitSortFields);
    saveOnly(tree, 'branches', branchSaveFields);

    tree.HEAD = {
      target: tree.HEAD.target,
      id: tree.HEAD.id
    };
  });
};

TreeCompare.prototype.compareTrees = function(treeA, treeB) {
  treeA = this.convertTreeSafe(treeA);
  treeB = this.convertTreeSafe(treeB);

  // now we need to strip out the fields we don't care about, aka things
  // like createTime, message, author
  this.reduceTreeFields([treeA, treeB]);

  return _.isEqual(treeA, treeB);
};

exports.TreeCompare = TreeCompare;


});
require("/src/js/git/treeCompare.js");

require.define("/src/js/level/arbiter.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

// Each level is part of a "sequence;" levels within
// a sequence proceed in order.
var levelSequences = require('../levels').levelSequences;
var sequenceInfo = require('../levels').sequenceInfo;

var Main = require('../app');

function LevelArbiter() {
  this.levelMap = {};
  this.levelSequences = levelSequences;
  this.sequences = [];
  this.init();

  var solvedMap;
  try {
    solvedMap = JSON.parse(localStorage.getItem('solvedMap') || '{}');
  } catch (e) {
    console.warn('local storage failed', e);
    // throw e;
  }
  this.solvedMap = solvedMap || {};

  Main.getEvents().on('levelSolved', this.levelSolved, this);
}

LevelArbiter.prototype.init = function() {
  var previousLevelID;
  _.each(this.levelSequences, function(levels, levelSequenceName) {
    this.sequences.push(levelSequenceName);
    if (!levels || !levels.length) {
      throw new Error('no empty sequences allowed');
    }

    // for this particular sequence...
    _.each(levels, function(level, index) {
      this.validateLevel(level);

      var id = levelSequenceName + String(index + 1);
      var compiledLevel = _.extend(
        {},
        level,
        {
          index: index,
          id: id,
          sequenceName: levelSequenceName
        }
      );

      // update our internal data
      this.levelMap[id] = compiledLevel;
      this.levelSequences[levelSequenceName][index] = compiledLevel;
    }, this);
  }, this);
};

LevelArbiter.prototype.isLevelSolved = function(id) {
  if (!this.levelMap[id]) {
    throw new Error('that level doesnt exist!');
  }
  return Boolean(this.solvedMap[id]);
};

LevelArbiter.prototype.levelSolved = function(id) {
  // called without an id when we reset solved status
  if (!id) { return; }

  this.solvedMap[id] = true;
  this.syncToStorage();
};

LevelArbiter.prototype.resetSolvedMap = function() {
  this.solvedMap = {};
  this.syncToStorage();
  Main.getEvents().trigger('levelSolved');
};

LevelArbiter.prototype.syncToStorage = function() {
  try {
    localStorage.setItem('solvedMap', JSON.stringify(this.solvedMap));
  } catch (e) {
    console.warn('local storage fialed on set', e);
  }
};

LevelArbiter.prototype.validateLevel = function(level) {
  level = level || {};
  var requiredFields = [
    'name',
    'goalTreeString',
    //'description',
    'solutionCommand'
  ];

  var optionalFields = [
    'hint',
    'disabledMap',
    'startTree'
  ];

  _.each(requiredFields, function(field) {
    if (level[field] === undefined) {
      console.log(level);
      throw new Error('I need this field for a level: ' + field);
    }
  });
};

LevelArbiter.prototype.getSequenceToLevels = function() {
  return this.levelSequences;
};

LevelArbiter.prototype.getSequences = function() {
  return _.keys(this.levelSequences);
};

LevelArbiter.prototype.getLevelsInSequence = function(sequenceName) {
  if (!this.levelSequences[sequenceName]) {
    throw new Error('that sequecne name ' + sequenceName + 'does not exist');
  }
  return this.levelSequences[sequenceName];
};

LevelArbiter.prototype.getSequenceInfo = function(sequenceName) {
  return sequenceInfo[sequenceName];
};

LevelArbiter.prototype.getLevel = function(id) {
  return this.levelMap[id];
};

LevelArbiter.prototype.getNextLevel = function(id) {
  if (!this.levelMap[id]) {
    console.warn('that level doesnt exist!!!');
    return null;
  }

  // meh, this method could be better. It's a tradeoff between
  // having the sequence structure be really simple JSON
  // and having no connectivity information between levels, which means
  // you have to build that up yourself on every query
  var level = this.levelMap[id];
  var sequenceName = level.sequenceName;
  var sequence = this.levelSequences[sequenceName];

  var nextIndex = level.index + 1;
  if (nextIndex < sequence.length) {
    return sequence[nextIndex];
  }

  var nextSequenceIndex = this.sequences.indexOf(sequenceName) + 1;
  if (nextSequenceIndex < this.sequences.length) {
    var nextSequenceName = this.sequences[nextSequenceIndex];
    return this.levelSequences[nextSequenceName][0];
  }

  // they finished the last level!
  return null;
};

exports.LevelArbiter = LevelArbiter;


});
require("/src/js/level/arbiter.js");

require.define("/src/js/level/builder.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var Q = require('q');

var util = require('../util');
var Main = require('../app');
var Errors = require('../util/errors');

var Visualization = require('../visuals/visualization').Visualization;
var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;
var Level = require('../level').Level;

var Command = require('../models/commandModel').Command;
var GitShim = require('../git/gitShim').GitShim;

var MultiView = require('../views/multiView').MultiView;

var CanvasTerminalHolder = require('../views').CanvasTerminalHolder;
var ConfirmCancelTerminal = require('../views').ConfirmCancelTerminal;
var NextLevelConfirm = require('../views').NextLevelConfirm;
var LevelToolbar = require('../views').LevelToolbar;

var MarkdownPresenter = require('../views/builderViews').MarkdownPresenter;
var MultiViewBuilder = require('../views/builderViews').MultiViewBuilder;
var MarkdownGrabber = require('../views/builderViews').MarkdownGrabber;

var regexMap = {
  'define goal': /^define goal$/,
  'define name': /^define name$/,
  'help builder': /^help builder$/,
  'define start': /^define start$/,
  'edit dialog': /^edit dialog$/,
  'show start': /^show start$/,
  'hide start': /^hide start$/,
  'define hint': /^define hint$/,
  'finish': /^finish$/
};

var parse = util.genParseCommand(regexMap, 'processLevelBuilderCommand');

var LevelBuilder = Level.extend({
  initialize: function(options) {
    options = options || {};
    options.level = options.level || {};

    options.level.startDialog = {
      childViews: require('../dialogs/levelBuilder').dialog
    };
    LevelBuilder.__super__.initialize.apply(this, [options]);

    this.initStartVisualization();
    this.startDialog = undefined;
    this.definedGoal = false;

    // we wont be using this stuff, and its to delete to ensure we overwrite all functions that
    // include that functionality
    delete this.treeCompare;
    delete this.solved;
  },

  initName: function() {
    this.levelToolbar = new LevelToolbar({
      name: 'Level Builder'
    });
  },

  initGoalData: function() {
    // add some default behavior in the beginning
    this.level.goalTreeString = '{"branches":{"master":{"target":"C1","id":"master"},"makeLevel":{"target":"C2","id":"makeLevel"}},"commits":{"C0":{"parents":[],"id":"C0","rootCommit":true},"C1":{"parents":["C0"],"id":"C1"},"C2":{"parents":["C1"],"id":"C2"}},"HEAD":{"target":"makeLevel","id":"HEAD"}}';
    this.level.solutionCommand = 'git checkout -b makeLevel; git commit';
    LevelBuilder.__super__.initGoalData.apply(this, arguments);
  },

  initStartVisualization: function() {
    this.startCanvasHolder = new CanvasTerminalHolder({
      additionalClass: 'startTree',
      text: 'You can hide this window with "hide start"'
    });

    this.startVis = new Visualization({
      el: this.startCanvasHolder.getCanvasLocation(),
      containerElement: this.startCanvasHolder.getCanvasLocation(),
      treeString: this.level.startTree,
      noKeyboardInput: true,
      noClick: true
    });
  },

  startDie: function() {
    this.startCanvasHolder.die();
    this.startVis.die();
  },

  startOffCommand: function() {
    Main.getEventBaton().trigger(
      'commandSubmitted',
      'echo "Get Building!!"'
    );
  },

  initParseWaterfall: function(options) {
    LevelBuilder.__super__.initParseWaterfall.apply(this, [options]);

    this.parseWaterfall.addFirst(
      'parseWaterfall',
      parse
    );
    this.parseWaterfall.addFirst(
      'instantWaterfall',
      this.getInstantCommands()
    );
  },

  buildLevel: function(command, deferred) {
    this.exitLevel();

    setTimeout(function() {
      Main.getSandbox().buildLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
  },

  getInstantCommands: function() {
    return [
      [/^help$|^\?$/, function() {
        throw new Errors.CommandResult({
          msg: 'You are in a level builder, so multiple forms of ' +
               'help are available. Please select either ' +
               '"help general" or "help builder"'
        });
      }]
    ];
  },

  takeControl: function() {
    Main.getEventBaton().stealBaton('processLevelBuilderCommand', this.processLevelBuilderCommand, this);

    LevelBuilder.__super__.takeControl.apply(this);
  },

  releaseControl: function() {
    Main.getEventBaton().releaseBaton('processLevelBuilderCommand', this.processLevelBuilderCommand, this);

    LevelBuilder.__super__.releaseControl.apply(this);
  },

  showGoal: function() {
    this.startCanvasHolder.slideOut();
    LevelBuilder.__super__.showGoal.apply(this, arguments);
  },

  showStart: function(command, deferred) {
    this.goalCanvasHolder.slideOut();
    this.startCanvasHolder.slideIn();

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.startCanvasHolder.getAnimationTime());
  },

  resetSolution: function() {
    this.gitCommandsIssued = [];
    this.level.solutionCommand = undefined;
  },

  hideStart: function(command, deferred) {
    this.startCanvasHolder.slideOut();

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.startCanvasHolder.getAnimationTime());
  },

  defineStart: function(command, deferred) {
    this.startDie();

    command.addWarning(
      'Defining start point... solution and goal will be overwritten if they were defined earlier'
    );
    this.resetSolution();

    this.level.startTree = this.mainVis.gitEngine.printTree();
    this.mainVis.resetFromThisTreeNow(this.level.startTree);

    this.initStartVisualization();

    this.showStart(command, deferred);
  },

  defineGoal: function(command, deferred) {
    this.goalDie();

    if (!this.gitCommandsIssued.length) {
      command.set('error', new Errors.GitError({
        msg: 'Your solution is empty!! something is amiss'
      }));
      deferred.resolve();
      return;
    }

    this.definedGoal = true;
    this.level.solutionCommand = this.gitCommandsIssued.join(';');
    this.level.goalTreeString = this.mainVis.gitEngine.printTree();
    this.initGoalVisualization();

    this.showGoal(command, deferred);
  },

  defineName: function(command, deferred) {
    this.level.name = prompt('Enter the name for the level');
    if (command) { command.finishWith(deferred); }
  },

  defineHint: function(command, deferred) {
    this.level.hint = prompt('Enter a hint! Or blank if you dont want one');
    if (command) { command.finishWith(deferred); }
  },

  editDialog: function(command, deferred) {
    var whenDoneEditing = Q.defer();
    this.currentBuilder = new MultiViewBuilder({
      multiViewJSON: this.startDialog,
      deferred: whenDoneEditing
    });
    whenDoneEditing.promise
    .then(_.bind(function(levelObj) {
      this.startDialog = levelObj;
    }, this))
    .fail(function() {
      // nothing to do, they dont want to edit it apparently
    })
    .done(function() {
      if (command) {
        command.finishWith(deferred);
      } else {
        deferred.resolve();
      }
    });
  },

  finish: function(command, deferred) {
    if (!this.gitCommandsIssued.length || !this.definedGoal) {
      command.set('error', new Errors.GitError({
        msg: 'Your solution is empty or goal is undefined!'
      }));
      deferred.resolve();
      return;
    }

    while (!this.level.name) {
      this.defineName();
    }

    var masterDeferred = Q.defer();
    var chain = masterDeferred.promise;

    if (this.level.hint === undefined) {
      var askForHintDeferred = Q.defer();
      chain = chain.then(function() {
        return askForHintDeferred.promise;
      });

      // ask for a hint if there is none
      var askForHintView = new ConfirmCancelTerminal({
        markdowns: [
          'You have not specified a hint, would you like to add one?'
        ]
      });
      askForHintView.getPromise()
      .then(_.bind(this.defineHint, this))
      .fail(_.bind(function() {
        this.level.hint = '';
      }, this))
      .done(function() {
        askForHintDeferred.resolve();
      });
    }

    if (this.startDialog === undefined) {
      var askForStartDeferred = Q.defer();
      chain = chain.then(function() {
        return askForStartDeferred.promise;
      });

      var askForStartView = new ConfirmCancelTerminal({
        markdowns: [
          'You have not specified a start dialog, would you like to add one?'
        ]
      });
      askForStartView.getPromise()
      .then(_.bind(function() {
        // oh boy this is complex
        var whenEditedDialog = Q.defer();
        // the undefined here is the command that doesnt need resolving just yet...
        this.editDialog(undefined, whenEditedDialog);
        return whenEditedDialog.promise;
      }, this))
      .fail(function() {
        // if they dont want to edit the start dialog, do nothing
      })
      .done(function() {
        askForStartDeferred.resolve();
      });
    }

    chain = chain.done(_.bind(function() {
      // ok great! lets just give them the goods
      new MarkdownPresenter({
        fillerText: JSON.stringify(this.getExportObj(), null, 2),
        previewText: 'Here is the JSON for this level! Share it with someone or send it to me on Github!'
      });
      command.finishWith(deferred);
    }, this));

    masterDeferred.resolve();
  },

  getExportObj: function() {
    var compiledLevel = _.extend(
      {},
      this.level
    );
    // the start dialog now is just our help intro thing
    delete compiledLevel.startDialog;
    if (this.startDialog) {
      compiledLevel.startDialog  = this.startDialog;
    }
    return compiledLevel;
  },

  processLevelBuilderCommand: function(command, deferred) {
    var methodMap = {
      'define goal': this.defineGoal,
      'define start': this.defineStart,
      'show start': this.showStart,
      'hide start': this.hideStart,
      'finish': this.finish,
      'define hint': this.defineHint,
      'edit dialog': this.editDialog,
      'help builder': LevelBuilder.__super__.startDialog
    };
    if (!methodMap[command.get('method')]) {
      throw new Error('woah we dont support that method yet');
    }

    methodMap[command.get('method')].apply(this, arguments);
  },

  afterCommandDefer: function(defer, command) {
    // we dont need to compare against the goal anymore
    defer.resolve();
  },

  die: function() {
    this.startDie();

    LevelBuilder.__super__.die.apply(this, arguments);

    delete this.startVis;
    delete this.startCanvasHolder;
  }
});

exports.LevelBuilder = LevelBuilder;
exports.regexMap = regexMap;

});
require("/src/js/level/builder.js");

require.define("/src/js/level/disabledMap.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var GitCommands = require('../git/commands');

var Errors = require('../util/errors');
var GitError = Errors.GitError;

function DisabledMap(options) {
  options = options || {};
  this.disabledMap = options.disabledMap || {
    'git cherry-pick': true,
    'git rebase': true
  };
}

DisabledMap.prototype.getInstantCommands = function() {
  // this produces an array of regex / function pairs that can be
  // piped into a parse waterfall to disable certain git commmands
  // :D
  var instants = [];
  var onMatch = function() {
    throw new GitError({
      msg: 'That git command is disabled for this level!'
    });
  };

  _.each(this.disabledMap, function(val, disabledCommand) {
    var gitRegex = GitCommands.regexMap[disabledCommand];
    if (!gitRegex) {
      throw new Error('wuttttt this disbaled command' + disabledCommand +
        ' has no regex matching');
    }
    instants.push([gitRegex, onMatch]);
  });
  return instants;
};

exports.DisabledMap = DisabledMap;


});
require("/src/js/level/disabledMap.js");

require.define("/src/js/level/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var Q = require('q');

var util = require('../util');
var Main = require('../app');

var Errors = require('../util/errors');
var Sandbox = require('../level/sandbox').Sandbox;
var Constants = require('../util/constants');

var Visualization = require('../visuals/visualization').Visualization;
var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;
var DisabledMap = require('../level/disabledMap').DisabledMap;
var Command = require('../models/commandModel').Command;
var GitShim = require('../git/gitShim').GitShim;

var MultiView = require('../views/multiView').MultiView;
var CanvasTerminalHolder = require('../views').CanvasTerminalHolder;
var ConfirmCancelTerminal = require('../views').ConfirmCancelTerminal;
var NextLevelConfirm = require('../views').NextLevelConfirm;
var LevelToolbar = require('../views').LevelToolbar;

var TreeCompare = require('../git/treeCompare').TreeCompare;

var regexMap = {
  'help level': /^help level$/,
  'start dialog': /^start dialog$/,
  'show goal': /^show goal$/,
  'hide goal': /^hide goal$/,
  'show solution': /^show solution($|\s)/
};

var parse = util.genParseCommand(regexMap, 'processLevelCommand');

var Level = Sandbox.extend({
  initialize: function(options) {
    options = options || {};
    options.level = options.level || {};

    this.level = options.level;

    this.gitCommandsIssued = [];
    this.commandsThatCount = this.getCommandsThatCount();
    this.solved = false;

    this.treeCompare = new TreeCompare();

    this.initGoalData(options);
    this.initName(options);

    Level.__super__.initialize.apply(this, [options]);
    this.startOffCommand();

    this.handleOpen(options.deferred);
  },

  handleOpen: function(deferred) {
    deferred = deferred || Q.defer();

    // if there is a multiview in the beginning, open that
    // and let it resolve our deferred
    if (this.level.startDialog && !this.testOption('noIntroDialog')) {
      new MultiView(_.extend(
        {},
        this.level.startDialog,
        { deferred: deferred }
      ));
      return;
    }

    // otherwise, resolve after a 700 second delay to allow
    // for us to animate easily
    setTimeout(function() {
      deferred.resolve();
    }, this.getAnimationTime() * 1.2);
  },

  startDialog: function(command, deferred) {
    if (!this.level.startDialog) {
      command.set('error', new Errors.GitError({
        msg: 'There is no start dialog to show for this level!'
      }));
      deferred.resolve();
      return;
    }

    this.handleOpen(deferred);
    deferred.promise.then(function() {
      command.set('status', 'finished');
    });
  },

  initName: function() {
    if (!this.level.name) {
      this.level.name = 'Rebase Classic';
      console.warn('REALLY BAD FORM need ids and names');
    }

    this.levelToolbar = new LevelToolbar({
      name: this.level.name
    });
  },

  initGoalData: function(options) {
    if (!this.level.goalTreeString || !this.level.solutionCommand) {
      throw new Error('need goal tree and solution');
    }
  },

  takeControl: function() {
    Main.getEventBaton().stealBaton('processLevelCommand', this.processLevelCommand, this);

    Level.__super__.takeControl.apply(this);
  },

  releaseControl: function() {
    Main.getEventBaton().releaseBaton('processLevelCommand', this.processLevelCommand, this);

    Level.__super__.releaseControl.apply(this);
  },

  startOffCommand: function() {
    if (!this.testOption('noStartCommand')) {
      Main.getEventBaton().trigger(
        'commandSubmitted',
        'hint; delay 2000; show goal'
      );
    }
  },

  initVisualization: function(options) {
    this.mainVis = new Visualization({
      el: options.el || this.getDefaultVisEl(),
      treeString: options.level.startTree
    });

    this.initGoalVisualization();
  },

  initGoalVisualization: function() {
    // first we make the goal visualization holder
    this.goalCanvasHolder = new CanvasTerminalHolder();

    // then we make a visualization. the "el" here is the element to
    // track for size information. the container is where the canvas will be placed
    this.goalVis = new Visualization({
      el: this.goalCanvasHolder.getCanvasLocation(),
      containerElement: this.goalCanvasHolder.getCanvasLocation(),
      treeString: this.level.goalTreeString,
      noKeyboardInput: true,
      noClick: true
    });
  },

  showSolution: function(command, deferred) {
    var toIssue = this.level.solutionCommand;
    var issueFunc = function() {
      Main.getEventBaton().trigger(
        'commandSubmitted',
        toIssue
      );
    };

    var commandStr = command.get('rawStr');
    if (!this.testOptionOnString(commandStr, 'noReset')) {
      toIssue = 'reset; ' + toIssue;
    }
    if (this.testOptionOnString(commandStr, 'force')) {
      issueFunc();
      command.finishWith(deferred);
      return;
    }

    // allow them for force the solution
    var confirmDefer = Q.defer();
    var confirmView = new ConfirmCancelTerminal({
      markdowns: [
        '## Are you sure you want to see the solution?',
        '',
        'I believe in you! You can do it'
      ],
      deferred: confirmDefer
    });

    confirmDefer.promise
    .then(issueFunc)
    .fail(function() {
      command.setResult("Great! I'll let you get back to it");
    })
    .done(function() {
     // either way we animate, so both options can share this logic
     setTimeout(function() {
        command.finishWith(deferred);
      }, confirmView.getAnimationTime());
    });
  },

  showGoal: function(command, defer) {
    this.goalCanvasHolder.slideIn();

    if (!command || !defer) { return; }
    setTimeout(function() {
      command.finishWith(defer);
    }, this.goalCanvasHolder.getAnimationTime());
  },

  hideGoal: function(command, defer) {
    this.goalCanvasHolder.slideOut();
    if (!command || !defer) { return; }

    setTimeout(function() {
      command.finishWith(defer);
    }, this.goalCanvasHolder.getAnimationTime());
  },

  initParseWaterfall: function(options) {
    Level.__super__.initParseWaterfall.apply(this, [options]);

    // add our specific functionaity
    this.parseWaterfall.addFirst(
      'parseWaterfall',
      parse
    );

    this.parseWaterfall.addFirst(
      'instantWaterfall',
      this.getInstantCommands()
    );

    // if we want to disable certain commands...
    if (options.level.disabledMap) {
      // disable these other commands
      this.parseWaterfall.addFirst(
        'instantWaterfall',
        new DisabledMap({
          disabledMap: options.level.disabledMap
        }).getInstantCommands()
      );
    }
  },

  initGitShim: function(options) {
    // ok we definitely want a shim here
    this.gitShim = new GitShim({
      afterCB: _.bind(this.afterCommandCB, this),
      afterDeferHandler: _.bind(this.afterCommandDefer, this)
    });
  },

  getCommandsThatCount: function() {
    var GitCommands = require('../git/commands');
    var toCount = [
      'git commit',
      'git checkout',
      'git rebase',
      'git reset',
      'git branch',
      'git revert',
      'git merge',
      'git cherry-pick'
    ];
    var myRegexMap = {};
    _.each(toCount, function(method) {
      if (!GitCommands.regexMap[method]) { throw new Error('wut no regex'); }

      myRegexMap[method] = GitCommands.regexMap[method];
    });
    return myRegexMap;
  },

  afterCommandCB: function(command) {
    var matched = false;
    _.each(this.commandsThatCount, function(regex) {
      matched = matched || regex.test(command.get('rawStr'));
    });
    if (matched) {
      this.gitCommandsIssued.push(command.get('rawStr'));
    }
  },

  afterCommandDefer: function(defer, command) {
    if (this.solved) {
      command.addWarning(
        "You've already solved this level, try other levels with 'show levels'" +
        "or go back to the sandbox with 'sandbox'"
      );
      defer.resolve();
      return;
    }

    // ok so lets see if they solved it...
    var current = this.mainVis.gitEngine.exportTree();
    var solved;
    if (this.level.compareOnlyMaster) {
      solved = this.treeCompare.compareBranchWithinTrees(current, this.level.goalTreeString, 'master');
    } else if (this.level.compareOnlyBranches) {
      solved = this.treeCompare.compareAllBranchesWithinTrees(current, this.level.goalTreeString);
    } else {
      solved = this.treeCompare.compareAllBranchesWithinTreesAndHEAD(current, this.level.goalTreeString);
    }

    if (!solved) {
      defer.resolve();
      return;
    }

    // woohoo!!! they solved the level, lets animate and such
    this.levelSolved(defer);
  },

  getNumSolutionCommands: function() {
    // strip semicolons in bad places
    var toAnalyze = this.level.solutionCommand.replace(/^;|;$/g, '');
    return toAnalyze.split(';').length;
  },

  testOption: function(option) {
    return this.options.command && new RegExp('--' + option).test(this.options.command.get('rawStr'));
  },

  testOptionOnString: function(str, option) {
    return str && new RegExp('--' + option).test(str);
  },

  levelSolved: function(defer) {
    this.solved = true;
    Main.getEvents().trigger('levelSolved', this.level.id);
    this.hideGoal();

    var nextLevel = Main.getLevelArbiter().getNextLevel(this.level.id);
    var numCommands = this.gitCommandsIssued.length;
    var best = this.getNumSolutionCommands();

    Constants.GLOBAL.isAnimating = true;
    var skipFinishDialog = this.testOption('noFinishDialog');
    var finishAnimationChain = this.mainVis.gitVisuals.finishAnimation();
    if (!skipFinishDialog) {
      finishAnimationChain = finishAnimationChain
      .then(function() {
        // we want to ask if they will move onto the next level
        // while giving them their results...
        var nextDialog = new NextLevelConfirm({
          nextLevel: nextLevel,
          numCommands: numCommands,
          best: best
        });

        return nextDialog.getPromise();
      });
    }

    finishAnimationChain
    .then(function() {
      if (!skipFinishDialog && nextLevel) {
        Main.getEventBaton().trigger(
          'commandSubmitted',
          'level ' + nextLevel.id
        );
      }
    })
    .fail(function() {
      // nothing to do, we will just close
    })
    .done(function() {
      Constants.GLOBAL.isAnimating = false;
      defer.resolve();
    });
  },

  die: function() {
    this.levelToolbar.die();

    this.goalDie();
    this.mainVis.die();
    this.releaseControl();

    this.clear();

    delete this.commandCollection;
    delete this.mainVis;
    delete this.goalVis;
    delete this.goalCanvasHolder;
  },

  goalDie: function() {
    this.goalCanvasHolder.die();
    this.goalVis.die();
  },

  getInstantCommands: function() {
    var hintMsg = (this.level.hint) ?
      this.level.hint :
      "Hmm, there doesn't seem to be a hint for this level :-/";

    return [
      [/^help$|^\?$/, function() {
        throw new Errors.CommandResult({
          msg: 'You are in a level, so multiple forms of help are available. Please select either ' +
               '"help level" or "help general"'
        });
      }],
      [/^hint$/, function() {
        throw new Errors.CommandResult({
          msg: hintMsg
        });
      }]
    ];
  },

  reset: function() {
    this.gitCommandsIssued = [];
    this.solved = false;
    Level.__super__.reset.apply(this, arguments);
  },

  buildLevel: function(command, deferred) {
    this.exitLevel();
    setTimeout(function() {
      Main.getSandbox().buildLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
  },

  importLevel: function(command, deferred) {
    this.exitLevel();
    setTimeout(function() {
      Main.getSandbox().importLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
  },

  startLevel: function(command, deferred) {
    this.exitLevel();

    setTimeout(function() {
      Main.getSandbox().startLevel(command, deferred);
    }, this.getAnimationTime() * 1.5);
    // wow! that was simple :D
  },

  exitLevel: function(command, deferred) {
    this.die();

    if (!command || !deferred) {
      return;
    }

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.getAnimationTime());

    // we need to fade in the sandbox
    Main.getEventBaton().trigger('levelExited');
  },

  processLevelCommand: function(command, defer) {
    var methodMap = {
      'show goal': this.showGoal,
      'hide goal': this.hideGoal,
      'show solution': this.showSolution,
      'start dialog': this.startDialog,
      'help level': this.startDialog
    };
    var method = methodMap[command.get('method')];
    if (!method) {
      throw new Error('woah we dont support that method yet', method);
    }

    method.apply(this, [command, defer]);
  }
});

exports.Level = Level;
exports.regexMap = regexMap;

});
require("/src/js/level/index.js");

require.define("/src/js/level/parseWaterfall.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var GitCommands = require('../git/commands');
var SandboxCommands = require('../level/SandboxCommands');

// more or less a static class
var ParseWaterfall = function(options) {
  options = options || {};
  this.options = options;
  this.shortcutWaterfall = options.shortcutWaterfall || [
    GitCommands.shortcutMap
  ];

  this.instantWaterfall = options.instantWaterfall || [
    GitCommands.instantCommands,
    SandboxCommands.instantCommands
  ];

  // defer the parse waterfall until later...
};

ParseWaterfall.prototype.initParseWaterfall = function() {
  // check for node when testing
  if (!require('../util').isBrowser()) {
    this.parseWaterfall = [GitCommands.parse];
    return;
  }

  // by deferring the initialization here, we dont require()
  // level too early (which barfs our init)
  this.parseWaterfall = this.options.parseWaterfall || [
    GitCommands.parse,
    SandboxCommands.parse,
    SandboxCommands.getOptimisticLevelParse(),
    SandboxCommands.getOptimisticLevelBuilderParse()
  ];
};

ParseWaterfall.prototype.clone = function() {
  return new ParseWaterfall({
    shortcutWaterfall: this.shortcutWaterfall.slice(),
    instantWaterfall: this.instantWaterfall.slice(),
    parseWaterfall: this.parseWaterfall.slice()
  });
};

ParseWaterfall.prototype.getWaterfallMap = function() {
  if (!this.parseWaterfall) {
    this.initParseWaterfall();
  }
  return {
    shortcutWaterfall: this.shortcutWaterfall,
    instantWaterfall: this.instantWaterfall,
    parseWaterfall: this.parseWaterfall
  };
};

ParseWaterfall.prototype.addFirst = function(which, value) {
  if (!which || !value) {
    throw new Error('need to know which!!!');
  }
  this.getWaterfallMap()[which].unshift(value);
};

ParseWaterfall.prototype.addLast = function(which, value) {
  this.getWaterfallMap()[which].push(value);
};

ParseWaterfall.prototype.expandAllShortcuts = function(commandStr) {
  _.each(this.shortcutWaterfall, function(shortcutMap) {
    commandStr = this.expandShortcut(commandStr, shortcutMap);
  }, this);
  return commandStr;
};

ParseWaterfall.prototype.expandShortcut = function(commandStr, shortcutMap) {
  _.each(shortcutMap, function(regex, method) {
    var results = regex.exec(commandStr);
    if (results) {
      commandStr = method + ' ' + commandStr.slice(results[0].length);
    }
  });
  return commandStr;
};

ParseWaterfall.prototype.processAllInstants = function(commandStr) {
  _.each(this.instantWaterfall, function(instantCommands) {
    this.processInstant(commandStr, instantCommands);
  }, this);
};

ParseWaterfall.prototype.processInstant = function(commandStr, instantCommands) {
  _.each(instantCommands, function(tuple) {
    var regex = tuple[0];
    var results = regex.exec(commandStr);
    if (results) {
      // this will throw a result because it's an instant
      tuple[1](results);
    }
  });
};

ParseWaterfall.prototype.parseAll = function(commandStr) {
  if (!this.parseWaterfall) {
    this.initParseWaterfall();
  }

  var toReturn = false;
  _.each(this.parseWaterfall, function(parseFunc) {
    var results = parseFunc(commandStr);
    if (results) {
      toReturn = results;
    }
  }, this);

  return toReturn;
};

exports.ParseWaterfall = ParseWaterfall;


});
require("/src/js/level/parseWaterfall.js");

require.define("/src/js/level/sandbox.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var Main = require('../app');

var Visualization = require('../visuals/visualization').Visualization;
var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;
var DisabledMap = require('../level/disabledMap').DisabledMap;
var Command = require('../models/commandModel').Command;
var GitShim = require('../git/gitShim').GitShim;

var Views = require('../views');
var ModalTerminal = Views.ModalTerminal;
var ModalAlert = Views.ModalAlert;
var BuilderViews = require('../views/builderViews');
var MultiView = require('../views/multiView').MultiView;

var Sandbox = Backbone.View.extend({
  // tag name here is purely vestigial. I made this a view
  // simply to use inheritance and have a nice event system in place
  tagName: 'div',
  initialize: function(options) {
    options = options || {};
    this.options = options;

    this.initVisualization(options);
    this.initCommandCollection(options);
    this.initParseWaterfall(options);
    this.initGitShim(options);

    if (!options.wait) {
      this.takeControl();
    }
  },

  getDefaultVisEl: function() {
    return $('#mainVisSpace')[0];
  },

  getAnimationTime: function() { return 700 * 1.5; },

  initVisualization: function(options) {
    this.mainVis = new Visualization({
      el: options.el || this.getDefaultVisEl()
    });
  },

  initCommandCollection: function(options) {
    // don't add it to just any collection -- adding to the
    // CommandUI collection will put in history
    this.commandCollection = Main.getCommandUI().commandCollection;
  },

  initParseWaterfall: function(options) {
    this.parseWaterfall = new ParseWaterfall();
  },

  initGitShim: function(options) {
  },

  takeControl: function() {
    // we will be handling commands that are submitted, mainly to add the sanadbox
    // functionality (which is included by default in ParseWaterfall())
    Main.getEventBaton().stealBaton('commandSubmitted', this.commandSubmitted, this);
    // we obviously take care of sandbox commands
    Main.getEventBaton().stealBaton('processSandboxCommand', this.processSandboxCommand, this);

    // a few things to help transition between levels and sandbox
    Main.getEventBaton().stealBaton('levelExited', this.levelExited, this);

    this.insertGitShim();
  },

  releaseControl: function() {
    // we will be handling commands that are submitted, mainly to add the sanadbox
    // functionality (which is included by default in ParseWaterfall())
    Main.getEventBaton().releaseBaton('commandSubmitted', this.commandSubmitted, this);
    // we obviously take care of sandbox commands
    Main.getEventBaton().releaseBaton('processSandboxCommand', this.processSandboxCommand, this);
    // a few things to help transition between levels and sandbox
    Main.getEventBaton().releaseBaton('levelExited', this.levelExited, this);

    this.releaseGitShim();
  },

  releaseGitShim: function() {
    if (this.gitShim) {
      this.gitShim.removeShim();
    }
  },

  insertGitShim: function() {
    // and our git shim goes in after the git engine is ready so it doesn't steal the baton
    // too early
    if (this.gitShim) {
      this.mainVis.customEvents.on('gitEngineReady', function() {
          this.gitShim.insertShim();
      },this);
    }
  },

  commandSubmitted: function(value) {
    // allow other things to see this command (aka command history on terminal)
    Main.getEvents().trigger('commandSubmittedPassive', value);

    util.splitTextCommand(value, function(command) {
      this.commandCollection.add(new Command({
        rawStr: command,
        parseWaterfall: this.parseWaterfall
      }));
    }, this);
  },

  startLevel: function(command, deferred) {
    var regexResults = command.get('regexResults') || [];
    var desiredID = regexResults[1] || '';
    var levelJSON = Main.getLevelArbiter().getLevel(desiredID);

    // handle the case where that level is not found...
    if (!levelJSON) {
      command.addWarning(
        'A level for that id "' + desiredID + '" was not found!! Opening up level selection view...'
      );
      Main.getEventBaton().trigger('commandSubmitted', 'levels');

      command.set('status', 'error');
      deferred.resolve();
      return;
    }

    // we are good to go!! lets prep a bit visually
    this.hide();
    this.clear();

    // we don't even need a reference to this,
    // everything will be handled via event baton :DDDDDDDDD
    var whenLevelOpen = Q.defer();
    var Level = require('../level').Level;

    this.currentLevel = new Level({
      level: levelJSON,
      deferred: whenLevelOpen,
      command: command
    });

    whenLevelOpen.promise.then(function() {
      command.finishWith(deferred);
    });
  },

  buildLevel: function(command, deferred) {
    this.hide();
    this.clear();

    var whenBuilderOpen = Q.defer();

    var LevelBuilder = require('../level/builder').LevelBuilder;
    this.levelBuilder = new LevelBuilder({
      deferred: whenBuilderOpen
    });

    whenBuilderOpen.promise.then(function() {
      command.finishWith(deferred);
    });
  },

  exitLevel: function(command, deferred) {
    command.addWarning(
      "You aren't in a level! You are in a sandbox, start a level with `level [id]`"
    );
    command.set('status', 'error');
    deferred.resolve();
  },

  showLevels: function(command, deferred) {
    var whenClosed = Q.defer();
    Main.getLevelDropdown().show(whenClosed, command);
    whenClosed.promise.done(function() {
      command.finishWith(deferred);
    });
  },

  resetSolved: function(command, deferred) {
    Main.getLevelArbiter().resetSolvedMap();
    command.addWarning(
      "Solved map was reset, you are starting from a clean slate!"
    );
    command.finishWith(deferred);
  },

  processSandboxCommand: function(command, deferred) {
    // I'm tempted to do camcel case conversion, but there are
    // some exceptions to the rule
    var commandMap = {
      'reset solved': this.resetSolved,
      'help general': this.helpDialog,
      'help': this.helpDialog,
      'reset': this.reset,
      'delay': this.delay,
      'clear': this.clear,
      'exit level': this.exitLevel,
      'level': this.startLevel,
      'sandbox': this.exitLevel,
      'levels': this.showLevels,
      'mobileAlert': this.mobileAlert,
      'build level': this.buildLevel,
      'export tree': this.exportTree,
      'import tree': this.importTree,
      'import level': this.importLevel
    };

    var method = commandMap[command.get('method')];
    if (!method) { throw new Error('no method for that wut'); }

    method.apply(this, [command, deferred]);
  },

  hide: function() {
    this.mainVis.hide();
  },

  levelExited: function() {
    this.show();
  },

  show: function() {
    this.mainVis.show();
  },

  importTree: function(command, deferred) {
    var jsonGrabber = new BuilderViews.MarkdownPresenter({
      previewText: "Paste a tree JSON blob below!",
      fillerText: ' '
    });
    jsonGrabber.deferred.promise
    .then(_.bind(function(treeJSON) {
      try {
        this.mainVis.gitEngine.loadTree(JSON.parse(treeJSON));
      } catch(e) {
        this.mainVis.reset();
        new MultiView({
          childViews: [{
            type: 'ModalAlert',
            options: {
              markdowns: [
                '## Error!',
                '',
                'Something is wrong with that JSON! Here is the error:',
                '',
                String(e)
              ]
            }
          }]
        });
      }
    }, this))
    .fail(function() { })
    .done(function() {
      command.finishWith(deferred);
    });
  },

  importLevel: function(command, deferred) {
    var jsonGrabber = new BuilderViews.MarkdownPresenter({
      previewText: 'Paste a level JSON blob in here!',
      fillerText: ' '
    });

    jsonGrabber.deferred.promise
    .then(_.bind(function(inputText) {
      var Level = require('../level').Level;
      try {
        var levelJSON = JSON.parse(inputText);
        var whenLevelOpen = Q.defer();
        this.currentLevel = new Level({
          level: levelJSON,
          deferred: whenLevelOpen,
          command: command
        });

        whenLevelOpen.promise.then(function() {
          command.finishWith(deferred);
        });
      } catch(e) {
        new MultiView({
          childViews: [{
            type: 'ModalAlert',
            options: {
              markdowns: [
                '## Error!',
                '',
                'Something is wrong with that level JSON, this happened:',
                '',
                String(e)
              ]
            }
          }]
        });
        command.finishWith(deferred);
      }
    }, this))
    .fail(function() {
      command.finishWith(deferred);
    })
    .done();
  },

  exportTree: function(command, deferred) {
    var treeJSON = JSON.stringify(this.mainVis.gitEngine.exportTree(), null, 2);

    var showJSON = new MultiView({
      childViews: [{
        type: 'MarkdownPresenter',
        options: {
          previewText: 'Share this tree with friends! They can load it with "import tree"',
          fillerText: treeJSON,
          noConfirmCancel: true
        }
      }]
    });
    showJSON.getPromise()
    .then(function() {
      command.finishWith(deferred);
    })
    .done();
  },

  clear: function(command, deferred) {
    Main.getEvents().trigger('clearOldCommands');
    if (command && deferred) {
      command.finishWith(deferred);
    }
  },

  mobileAlert: function(command, deferred) {
    alert("Can't bring up the keyboard on mobile / tablet :( try visiting on desktop! :D");
    command.finishWith(deferred);
  },

  delay: function(command, deferred) {
    var amount = parseInt(command.get('regexResults')[1], 10);
    setTimeout(function() {
      command.finishWith(deferred);
    }, amount);
  },

  reset: function(command, deferred) {
    this.mainVis.reset();

    setTimeout(function() {
      command.finishWith(deferred);
    }, this.mainVis.getAnimationTime());
  },

  helpDialog: function(command, deferred) {
    var helpDialog = new MultiView({
      childViews: require('../dialogs/sandbox').dialog
    });
    helpDialog.getPromise().then(_.bind(function() {
      // the view has been closed, lets go ahead and resolve our command
      command.finishWith(deferred);
    }, this))
    .done();
  }
});

exports.Sandbox = Sandbox;


});
require("/src/js/level/sandbox.js");

require.define("/src/js/level/sandboxCommands.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var util = require('../util');

var Errors = require('../util/errors');
var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var instantCommands = [
  [/^ls/, function() {
    throw new CommandResult({
      msg: "DontWorryAboutFilesInThisDemo.txt"
    });
  }],
  [/^cd/, function() {
    throw new CommandResult({
      msg: "Directory Changed to '/directories/dont/matter/in/this/demo'"
    });
  }],
  [/^refresh$/, function() {
    var events = require('../app').getEvents();

    events.trigger('refreshTree');
    throw new CommandResult({
      msg: "Refreshing tree..."
    });
  }],
  [/^rollup (\d+)$/, function(bits) {
    var events = require('../app').getEvents();

    // go roll up these commands by joining them with semicolons
    events.trigger('rollupCommands', bits[1]);
    throw new CommandResult({
      msg: 'Commands combined!'
    });
  }],
  [/^echo "(.*?)"$|^echo (.*?)$/, function(bits) {
    var msg = bits[1] || bits[2];
    throw new CommandResult({
      msg: msg
    });
  }]
];

var regexMap = {
  'reset solved': /^reset solved($|\s)/,
  'help': /^help( general)?$|^\?$/,
  'reset': /^reset$/,
  'delay': /^delay (\d+)$/,
  'clear': /^clear($|\s)/,
  'exit level': /^exit level($|\s)/,
  'sandbox': /^sandbox($|\s)/,
  'level': /^level\s?([a-zA-Z0-9]*)/,
  'levels': /^levels($|\s)/,
  'mobileAlert': /^mobile alert($|\s)/,
  'build level': /^build level($|\s)/,
  'export tree': /^export tree$/,
  'import tree': /^import tree$/,
  'import level': /^import level$/
};

exports.instantCommands = instantCommands;
exports.parse = util.genParseCommand(regexMap, 'processSandboxCommand');

// optimistically parse some level and level builder commands; we do this
// so you can enter things like "level intro1; show goal" and not
// have it barf. when the
// command fires the event, it will check if there is a listener and if not throw
// an error

// note: these are getters / setters because the require kills us
exports.getOptimisticLevelParse = function() {
  return util.genParseCommand(
    require('../level').regexMap,
    'processLevelCommand'
  );
};

exports.getOptimisticLevelBuilderParse = function() {
  return util.genParseCommand(
    require('../level/builder').regexMap,
    'processLevelBuilderCommand'
  );
};

});
require("/src/js/level/sandboxCommands.js");

require.define("/src/js/models/collections.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Commit = require('../git').Commit;
var Branch = require('../git').Branch;

var Command = require('../models/commandModel').Command;
var CommandEntry = require('../models/commandModel').CommandEntry;
var TIME = require('../util/constants').TIME;

var CommitCollection = Backbone.Collection.extend({
  model: Commit
});

var CommandCollection = Backbone.Collection.extend({
  model: Command
});

var BranchCollection = Backbone.Collection.extend({
  model: Branch
});

var CommandEntryCollection = Backbone.Collection.extend({
  model: CommandEntry,
  localStorage: (Backbone.LocalStorage) ? new Backbone.LocalStorage('CommandEntries') : null
});

var CommandBuffer = Backbone.Model.extend({
  defaults: {
    collection: null
  },

  initialize: function(options) {
    options.collection.bind('add', this.addCommand, this);

    this.buffer = [];
    this.timeout = null;
  },

  addCommand: function(command) {
    this.buffer.push(command);
    this.touchBuffer();
  },

  touchBuffer: function() {
    // touch buffer just essentially means we just check if our buffer is being
    // processed. if it's not, we immediately process the first item
    // and then set the timeout.
    if (this.timeout) {
      // timeout existence implies its being processed
      return;
    }
    this.setTimeout();
  },


  setTimeout: function() {
    this.timeout = setTimeout(_.bind(function() {
        this.sipFromBuffer();
    }, this), TIME.betweenCommandsDelay);
  },

  popAndProcess: function() {
    var popped = this.buffer.shift(0);

    // find a command with no error (aka unprocessed)
    while (popped.get('error') && this.buffer.length) {
      popped = this.buffer.shift(0);
    }
    if (!popped.get('error')) {
      this.processCommand(popped);
    } else {
      // no more commands to process
      this.clear();
    }
  },

  processCommand: function(command) {
    command.set('status', 'processing');

    var deferred = Q.defer();
    deferred.promise.then(_.bind(function() {
      this.setTimeout();
    }, this));

    var eventName = command.get('eventName');
    if (!eventName) {
      throw new Error('I need an event to trigger when this guy is parsed and ready');
    }

    var Main = require('../app');
    var eventBaton = Main.getEventBaton();

    var numListeners = eventBaton.getNumListeners(eventName);
    if (!numListeners) {
      var Errors = require('../util/errors');
      command.set('error', new Errors.GitError({
        msg: 'That command is valid, but not supported in this current environment!' +
             ' Try entering a level or level builder to use that command'
      }));
      deferred.resolve();
      return;
    }

    Main.getEventBaton().trigger(eventName, command, deferred);
  },

  clear: function() {
    clearTimeout(this.timeout);
    this.timeout = null;
  },

  sipFromBuffer: function() {
    if (!this.buffer.length) {
      this.clear();
      return;
    }

    this.popAndProcess();
  }
});

exports.CommitCollection = CommitCollection;
exports.CommandCollection = CommandCollection;
exports.BranchCollection = BranchCollection;
exports.CommandEntryCollection = CommandEntryCollection;
exports.CommandBuffer = CommandBuffer;


});
require("/src/js/models/collections.js");

require.define("/src/js/models/commandModel.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Errors = require('../util/errors');
var GitCommands = require('../git/commands');
var GitOptionParser = GitCommands.GitOptionParser;

var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;

var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var Command = Backbone.Model.extend({
  defaults: {
    status: 'inqueue',
    rawStr: null,
    result: '',
    createTime: null,

    error: null,
    warnings: null,
    parseWaterfall: new ParseWaterfall(),

    generalArgs: null,
    supportedMap: null,
    options: null,
    method: null

  },

  initialize: function(options) {
    this.initDefaults();
    this.validateAtInit();

    this.on('change:error', this.errorChanged, this);
    // catch errors on init
    if (this.get('error')) {
      this.errorChanged();
    }

    this.parseOrCatch();
  },

  initDefaults: function() {
    // weird things happen with defaults if you dont
    // make new objects
    this.set('generalArgs', []);
    this.set('supportedMap', {});
    this.set('warnings', []);
  },

  validateAtInit: function() {
    if (this.get('rawStr') === null) {
      throw new Error('Give me a string!');
    }
    if (!this.get('createTime')) {
      this.set('createTime', new Date().toString());
    }
  },

  setResult: function(msg) {
    this.set('result', msg);
  },

  finishWith: function(deferred) {
    this.set('status', 'finished');
    deferred.resolve();
  },

  addWarning: function(msg) {
    this.get('warnings').push(msg);
    // change numWarnings so the change event fires. This is bizarre -- Backbone can't
    // detect if an array changes, so adding an element does nothing
    this.set('numWarnings', this.get('numWarnings') ? this.get('numWarnings') + 1 : 1);
  },

  getFormattedWarnings: function() {
    if (!this.get('warnings').length) {
      return '';
    }
    var i = '<i class="icon-exclamation-sign"></i>';
    return '<p>' + i + this.get('warnings').join('</p><p>' + i) + '</p>';
  },

  parseOrCatch: function() {
    this.expandShortcuts(this.get('rawStr'));
    try {
      this.processInstants();
    } catch (err) {
      Errors.filterError(err);
      // errorChanged() will handle status and all of that
      this.set('error', err);
      return;
    }

    if (this.parseAll()) {
      // something in our parse waterfall succeeded
      return;
    }

    // if we reach here, this command is not supported :-/
    this.set('error', new CommandProcessError({
        msg: 'The command "' + this.get('rawStr') + '" isn\'t supported, sorry!'
      })
    );
  },

  errorChanged: function() {
    var err = this.get('error');
    if (err instanceof CommandProcessError ||
        err instanceof GitError) {
      this.set('status', 'error');
    } else if (err instanceof CommandResult) {
      this.set('status', 'finished');
    } else if (err instanceof Warning) {
      this.set('status', 'warning');
    }
    this.formatError();
  },

  formatError: function() {
    this.set('result', this.get('error').toResult());
  },

  expandShortcuts: function(str) {
    str = this.get('parseWaterfall').expandAllShortcuts(str);
    this.set('rawStr', str);
  },

  processInstants: function() {
    var str = this.get('rawStr');
    // first if the string is empty, they just want a blank line
    if (!str.length) {
      throw new CommandResult({msg: ""});
    }

    // then instant commands that will throw
    this.get('parseWaterfall').processAllInstants(str);
  },

  parseAll: function() {
    var str = this.get('rawStr');
    var results = this.get('parseWaterfall').parseAll(str);

    if (!results) {
      // nothing parsed successfully
      return false;
    }

    _.each(results.toSet, function(obj, key) {
      // data comes back from the parsing functions like
      // options (etc) that need to be set
      this.set(key, obj);
    }, this);
    return true;
  }
});

// command entry is for the commandview
var CommandEntry = Backbone.Model.extend({
  defaults: {
    text: ''
  }
});

exports.CommandEntry = CommandEntry;
exports.Command = Command;

});
require("/src/js/models/commandModel.js");

require.define("/src/js/util/constants.js",function(require,module,exports,__dirname,__filename,process,global){/**
 * Constants....!!!
 */
var TIME = {
  betweenCommandsDelay: 400
};

// useful for locks, etc
var GLOBAL = {
  isAnimating: false
};

var VIEWPORT = {
  minZoom: 0.55,
  maxZoom: 1.25,
  minWidth: 600,
  minHeight: 600
};

var GRAPHICS = {
  arrowHeadSize: 8,

  nodeRadius: 17,
  curveControlPointOffset: 50,
  defaultEasing: 'easeInOut',
  defaultAnimationTime: 400,

  //rectFill: '#FF3A3A',
  rectFill: 'hsb(0.8816909813322127,0.7,1)',
  headRectFill: '#2831FF',
  rectStroke: '#FFF',
  rectStrokeWidth: '3',

  multiBranchY: 20,
  upstreamHeadOpacity: 0.5,
  upstreamNoneOpacity: 0.2,
  edgeUpstreamHeadOpacity: 0.4,
  edgeUpstreamNoneOpacity: 0.15,

  visBranchStrokeWidth: 2,
  visBranchStrokeColorNone: '#333',

  defaultNodeFill: 'hsba(0.5,0.8,0.7,1)',
  defaultNodeStrokeWidth: 2,
  defaultNodeStroke: '#FFF',

  orphanNodeFill: 'hsb(0.5,0.8,0.7)'
};

exports.GLOBAL = GLOBAL;
exports.TIME = TIME;
exports.GRAPHICS = GRAPHICS;
exports.VIEWPORT = VIEWPORT;


});
require("/src/js/util/constants.js");

require.define("/src/js/util/debug.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var toGlobalize = {
  Tree: require('../visuals/tree'),
  Visuals: require('../visuals'),
  Git: require('../git'),
  CommandModel: require('../models/commandModel'),
  Levels: require('../git/treeCompare'),
  Constants: require('../util/constants'),
  Collections: require('../models/collections'),
  Async: require('../visuals/animation'),
  AnimationFactory: require('../visuals/animation/animationFactory'),
  Main: require('../app'),
  HeadLess: require('../git/headless'),
  Q: { Q: require('q') },
  RebaseView: require('../views/rebaseView'),
  Views: require('../views'),
  MultiView: require('../views/multiView'),
  ZoomLevel: require('../util/zoomLevel'),
  VisBranch: require('../visuals/visBranch'),
  Level: require('../level'),
  Sandbox: require('../level/sandbox'),
  GitDemonstrationView: require('../views/gitDemonstrationView'),
  Markdown: require('markdown'),
  LevelDropdownView: require('../views/levelDropdownView'),
  BuilderViews: require('../views/builderViews')
};

_.each(toGlobalize, function(module) {
  _.extend(window, module);
});

$(document).ready(function() {
  window.events = toGlobalize.Main.getEvents();
  window.eventBaton = toGlobalize.Main.getEventBaton();
  window.sandbox = toGlobalize.Main.getSandbox();
  window.modules = toGlobalize;
  window.levelDropdown = toGlobalize.Main.getLevelDropdown();
});


});
require("/src/js/util/debug.js");

require.define("/src/js/util/errors.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var MyError = Backbone.Model.extend({
  defaults: {
    type: 'MyError',
    msg: 'Unknown Error'
  },
  toString: function() {
    return this.get('type') + ': ' + this.get('msg');
  },

  getMsg: function() {
    return this.get('msg') || 'Unknown Error';
  },

  toResult: function() {
    if (!this.get('msg').length) {
      return '';
    }
    return '<p>' + this.get('msg').replace(/\n/g, '</p><p>') + '</p>';
  }
});

var CommandProcessError = exports.CommandProcessError = MyError.extend({
  defaults: {
    type: 'Command Process Error'
  }
});

var CommandResult = exports.CommandResult = MyError.extend({
  defaults: {
    type: 'Command Result'
  }
});

var Warning = exports.Warning = MyError.extend({
  defaults: {
    type: 'Warning'
  }
});

var GitError = exports.GitError = MyError.extend({
  defaults: {
    type: 'Git Error'
  }
});

var filterError = function(err) {
  if (err instanceof CommandProcessError ||
      err instanceof GitError ||
      err instanceof CommandResult ||
      err instanceof Warning) {
    // yay! one of ours
    return;
  } else {
    throw err;
  }
};

exports.filterError = filterError;

});
require("/src/js/util/errors.js");

require.define("/src/js/util/eventBaton.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

function EventBaton() {
  this.eventMap = {};
}

// this method steals the "baton" -- aka, only this method will now
// get called. analogous to events.on
// EventBaton.prototype.on = function(name, func, context) {
EventBaton.prototype.stealBaton = function(name, func, context) {
  if (!name) { throw new Error('need name'); }
  if (!func) { throw new Error('need func!'); }

  var listeners = this.eventMap[name] || [];
  listeners.push({
    func: func,
    context: context
  });
  this.eventMap[name] = listeners;
};

EventBaton.prototype.sliceOffArgs = function(num, args) {
  var newArgs = [];
  for (var i = num; i < args.length; i++) {
    newArgs.push(args[i]);
  }
  return newArgs;
};

EventBaton.prototype.trigger = function(name) {
  // arguments is weird and doesnt do slice right
  var argsToApply = this.sliceOffArgs(1, arguments);

  var listeners = this.eventMap[name];
  if (!listeners || !listeners.length) {
    console.warn('no listeners for', name);
    return;
  }

  // call the top most listener with context and such
  var toCall = listeners.slice(-1)[0];
  toCall.func.apply(toCall.context, argsToApply);
};

EventBaton.prototype.getNumListeners = function(name) {
  var listeners = this.eventMap[name] || [];
  return listeners.length;
};

EventBaton.prototype.getListenersThrow = function(name) {
  var listeners = this.eventMap[name];
  if (!listeners || !listeners.length) {
    throw new Error('no one has that baton!' + name);
  }
  return listeners;
};

EventBaton.prototype.passBatonBackSoft = function(name, func, context, args) {
  try {
    return this.passBatonBack(name, func, context, args);
  } catch (e) {
  }
};

EventBaton.prototype.passBatonBack = function(name, func, context, args) {
  // this method will call the listener BEFORE the name/func pair. this
  // basically allows you to put in shims, where you steal batons but pass
  // them back if they don't meet certain conditions
  var listeners = this.getListenersThrow(name);

  var indexBefore;
  _.each(listeners, function(listenerObj, index) {
    // skip the first
    if (index === 0) { return; }
    if (listenerObj.func === func && listenerObj.context === context) {
      indexBefore = index - 1;
    }
  }, this);
  if (indexBefore === undefined) {
    throw new Error('you are the last baton holder! or i didnt find you');
  }
  var toCallObj = listeners[indexBefore];

  toCallObj.func.apply(toCallObj.context, args);
};

EventBaton.prototype.releaseBaton = function(name, func, context) {
  // might be in the middle of the stack, so we have to loop instead of
  // just popping blindly
  var listeners = this.getListenersThrow(name);

  var newListeners = [];
  var found = false;
  _.each(listeners, function(listenerObj) {
    if (listenerObj.func === func && listenerObj.context === context) {
      if (found) {
        console.warn('woah duplicates!!!');
        console.log(listeners);
      }
      found = true;
    } else {
      newListeners.push(listenerObj);
    }
  }, this);

  if (!found) {
    console.log('did not find that function', func, context, name, arguments);
    console.log(this.eventMap);
    throw new Error('cant releasebaton if yu dont have it');
  }
  this.eventMap[name] = newListeners;
};

exports.EventBaton = EventBaton;


});
require("/src/js/util/eventBaton.js");

require.define("/src/js/util/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

exports.isBrowser = function() {
  var inBrowser = String(typeof window) !== 'undefined';
  return inBrowser;
};

exports.splitTextCommand = function(value, func, context) {
  func = _.bind(func, context);
  _.each(value.split(';'), function(command, index) {
    command = _.escape(command);
    command = command
      .replace(/^(\s+)/, '')
      .replace(/(\s+)$/, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");

    if (index > 0 && !command.length) {
      return;
    }
    func(command);
  });
};

exports.genParseCommand = function(regexMap, eventName) {
  return function(str) {
    var method;
    var regexResults;

    _.each(regexMap, function(regex, _method) {
      var results = regex.exec(str);
      if (results) {
        method = _method;
        regexResults = results;
      }
    });

    return (!method) ? false : {
      toSet: {
        eventName: eventName,
        method: method,
        regexResults: regexResults
      }
    };
  };
};

});
require("/src/js/util/index.js");

require.define("/src/js/util/keyboard.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var Main = require('../app');

var mapKeycodeToKey = function(keycode) {
  // HELP WANTED -- internationalize? Dvorak? I have no idea
  var keyMap = {
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    27: 'esc',
    13: 'enter'
  };
  return keyMap[keycode];
};

function KeyboardListener(options) {
  this.events = options.events || _.clone(Backbone.Events);
  this.aliasMap = options.aliasMap || {};

  if (!options.wait) {
    this.listen();
  }
}

KeyboardListener.prototype.listen = function() {
  if (this.listening) {
    return;
  }
  this.listening = true;
  Main.getEventBaton().stealBaton('docKeydown', this.keydown, this);
};

KeyboardListener.prototype.mute = function() {
  this.listening = false;
  Main.getEventBaton().releaseBaton('docKeydown', this.keydown, this);
};

KeyboardListener.prototype.keydown = function(e) {
  var which = e.which || e.keyCode;

  var key = mapKeycodeToKey(which);
  if (key === undefined) {
    return;
  }

  this.fireEvent(key, e);
};

KeyboardListener.prototype.fireEvent = function(eventName, e) {
  eventName = this.aliasMap[eventName] || eventName;
  this.events.trigger(eventName, e);
};

KeyboardListener.prototype.passEventBack = function(e) {
  Main.getEventBaton().passBatonBackSoft('docKeydown', this.keydown, this, [e]);
};

exports.KeyboardListener = KeyboardListener;
exports.mapKeycodeToKey = mapKeycodeToKey;


});
require("/src/js/util/keyboard.js");

require.define("/src/js/util/mock.js",function(require,module,exports,__dirname,__filename,process,global){exports.mock = function(Constructor) {
  var dummy = {};
  var stub = function() {};

  for (var key in Constructor.prototype) {
    dummy[key] = stub;
  }
  return dummy;
};


});
require("/src/js/util/mock.js");

require.define("/src/js/util/zoomLevel.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

var warnOnce = true;

function detectZoom() {
  /**
   * Note: this method has only been tested on Chrome
   * but seems to work. A much more elaborate library is available here:
   * https://github.com/yonran/detect-zoom
   * but seems to return a "2" zoom level for my computer (who knows)
   * so I can't use it. The ecosystem for zoom level detection is a mess
   */
  if (!window.outerWidth || !window.innerWidth) {
    if (warnOnce) {
      console.warn("Can't detect zoom level correctly :-/");
      warnOnce = false;
    }
    return 1;
  }

  return window.outerWidth / window.innerWidth;
}

var locked = true;
var setupZoomPoll = function(callback, context) {
  var currentZoom = 0;

  setInterval(function() {
    var newZoom = detectZoom();

    if (newZoom !== currentZoom) {
      // we need to wait one more before issuing callback
      // to avoid window resize issues
      if (locked) {
        locked = false;
        return;
      }

      currentZoom = newZoom;
      callback.apply(context, [newZoom]);
    } else {
      locked = true;
    }
  }, 500);
};

exports.setupZoomPoll = setupZoomPoll;
exports.detectZoom = detectZoom;


});
require("/src/js/util/zoomLevel.js");

require.define("/src/js/views/builderViews.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var KeyboardListener = require('../util/keyboard').KeyboardListener;

var Views = require('../views');
var ModalTerminal = Views.ModalTerminal;
var ContainedBase = Views.ContainedBase;

var MultiView = require('../views/multiView').MultiView;

var TextGrabber = ContainedBase.extend({
  tagName: 'div',
  className: 'textGrabber box vertical',
  template: _.template($('#text-grabber').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      helperText: options.helperText || 'Enter some text'
    };

    this.container = options.container || new ModalTerminal({
      title: 'Enter some text'
    });
    this.render();
    if (options.initialText) {
      this.setText(options.initialText);
    }

    if (!options.wait) {
      this.show();
    }
  },

  getText: function() {
    return this.$('textarea').val();
  },

  setText: function(str) {
    this.$('textarea').val(str);
  }
});

var MarkdownGrabber = ContainedBase.extend({
  tagName: 'div',
  className: 'markdownGrabber box horizontal',
  template: _.template($('#markdown-grabber-view').html()),
  events: {
    'keyup textarea': 'keyup'
  },

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();

    if (options.fromObj) {
      options.fillerText = options.fromObj.options.markdowns.join('\n');
    }

    this.JSON = {
      previewText: options.previewText || 'Preview',
      fillerText: options.fillerText || '## Enter some markdown!\n\n\n'
    };

    this.container = options.container || new ModalTerminal({
      title: options.title || 'Enter some markdown'
    });
    this.render();

    if (!options.withoutButton) {
      // do button stuff
      var buttonDefer = Q.defer();
      buttonDefer.promise
      .then(_.bind(this.confirmed, this))
      .fail(_.bind(this.cancelled, this))
      .done();

      var confirmCancel = new Views.ConfirmCancelView({
        deferred: buttonDefer,
        destination: this.getDestination()
      });
    }

    this.updatePreview();

    if (!options.wait) {
      this.show();
    }
  },

  confirmed: function() {
    this.die();
    this.deferred.resolve(this.getRawText());
  },

  cancelled: function() {
    this.die();
    this.deferred.resolve();
  },

  keyup: function() {
    if (!this.throttledPreview) {
      this.throttledPreview = _.throttle(
        _.bind(this.updatePreview, this),
        500
      );
    }
    this.throttledPreview();
  },

  getRawText: function() {
    return this.$('textarea').val();
  },

  exportToArray: function() {
    return this.getRawText().split('\n');
  },

  getExportObj: function() {
    return {
      markdowns: this.exportToArray()
    };
  },

  updatePreview: function() {
    var raw = this.getRawText();
    var HTML = require('markdown').markdown.toHTML(raw);
    this.$('div.insidePreview').html(HTML);
  }
});

var MarkdownPresenter = ContainedBase.extend({
  tagName: 'div',
  className: 'markdownPresenter box vertical',
  template: _.template($('#markdown-presenter').html()),

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();
    this.JSON = {
      previewText: options.previewText || 'Here is something for you',
      fillerText: options.fillerText || '# Yay'
    };

    this.container = new ModalTerminal({
      title: 'Check this out...'
    });
    this.render();

    if (!options.noConfirmCancel) {
      var confirmCancel = new Views.ConfirmCancelView({
        destination: this.getDestination()
      });
      confirmCancel.deferred.promise
      .then(_.bind(function() {
        this.deferred.resolve(this.grabText());
      }, this))
      .fail(_.bind(function() {
        this.deferred.reject();
      }, this))
      .done(_.bind(this.die, this));
    }

    this.show();
  },

  grabText: function() {
    return this.$('textarea').val();
  }
});

var DemonstrationBuilder = ContainedBase.extend({
  tagName: 'div',
  className: 'demonstrationBuilder box vertical',
  template: _.template($('#demonstration-builder').html()),
  events: {
    'click div.testButton': 'testView'
  },

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();
    if (options.fromObj) {
      var toEdit = options.fromObj.options;
      options = _.extend(
        {},
        options,
        toEdit,
        {
          beforeMarkdown: toEdit.beforeMarkdowns.join('\n'),
          afterMarkdown: toEdit.afterMarkdowns.join('\n')
        }
      );
    }

    this.JSON = {};
    this.container = new ModalTerminal({
      title: 'Demonstration Builder'
    });
    this.render();

    // build the two markdown grabbers
    this.beforeMarkdownView = new MarkdownGrabber({
      container: this,
      withoutButton: true,
      fillerText: options.beforeMarkdown,
      previewText: 'Before demonstration Markdown'
    });
    this.beforeCommandView = new TextGrabber({
      container: this,
      helperText: 'The git command(s) to set up the demonstration view (before it is displayed)',
      initialText: options.beforeCommand || 'git checkout -b bugFix'
    });

    this.commandView = new TextGrabber({
      container: this,
      helperText: 'The git command(s) to demonstrate to the reader',
      initialText: options.command || 'git commit'
    });

    this.afterMarkdownView = new MarkdownGrabber({
      container: this,
      withoutButton: true,
      fillerText: options.afterMarkdown,
      previewText: 'After demonstration Markdown'
    });

    // build confirm button
    var buttonDeferred = Q.defer();
    var confirmCancel = new Views.ConfirmCancelView({
      deferred: buttonDeferred,
      destination: this.getDestination()
    });

    buttonDeferred.promise
    .then(_.bind(this.confirmed, this))
    .fail(_.bind(this.cancelled, this))
    .done();
  },

  testView: function() {
    new MultiView({
      childViews: [{
        type: 'GitDemonstrationView',
        options: this.getExportObj()
      }]
    });
  },

  getExportObj: function() {
    return {
      beforeMarkdowns: this.beforeMarkdownView.exportToArray(),
      afterMarkdowns: this.afterMarkdownView.exportToArray(),
      command: this.commandView.getText(),
      beforeCommand: this.beforeCommandView.getText()
    };
  },

  confirmed: function() {
    this.die();
    this.deferred.resolve(this.getExportObj());
  },

  cancelled: function() {
    this.die();
    this.deferred.resolve();
  },

  getInsideElement: function() {
    return this.$('.insideBuilder')[0];
  }
});

var MultiViewBuilder = ContainedBase.extend({
  tagName: 'div',
  className: 'multiViewBuilder box vertical',
  template: _.template($('#multi-view-builder').html()),
  typeToConstructor: {
    ModalAlert: MarkdownGrabber,
    GitDemonstrationView: DemonstrationBuilder
  },

  events: {
    'click div.deleteButton': 'deleteOneView',
    'click div.testButton': 'testOneView',
    'click div.editButton': 'editOneView',
    'click div.testEntireView': 'testEntireView',
    'click div.addView': 'addView',
    'click div.saveView': 'saveView',
    'click div.cancelView': 'cancel'
  },

  initialize: function(options) {
    options = options || {};
    this.deferred = options.deferred || Q.defer();
    this.multiViewJSON = options.multiViewJSON || {};

    this.JSON = {
      views: this.getChildViews(),
      supportedViews: _.keys(this.typeToConstructor)
    };

    this.container = new ModalTerminal({
      title: 'Build a MultiView!'
    });
    this.render();

    this.show();
  },

  saveView: function() {
    this.hide();
    this.deferred.resolve(this.multiViewJSON);
  },

  cancel: function() {
    this.hide();
    this.deferred.resolve();
  },

  addView: function(ev) {
    var el = ev.srcElement;
    var type = $(el).attr('data-type');

    var whenDone = Q.defer();
    var Constructor = this.typeToConstructor[type];
    var builder = new Constructor({
      deferred: whenDone
    });
    whenDone.promise
    .then(_.bind(function() {
      var newView = {
        type: type,
        options: builder.getExportObj()
      };
      this.addChildViewObj(newView);
    }, this))
    .fail(function() {
      // they dont want to add the view apparently, so just return
    })
    .done();
  },

  testOneView: function(ev) {
    var el = ev.srcElement;
    var index = $(el).attr('data-index');
    var toTest = this.getChildViews()[index];
    new MultiView({
      childViews: [toTest]
    });
  },

  testEntireView: function() {
    new MultiView({
      childViews: this.getChildViews()
    });
  },

  editOneView: function(ev) {
    var el = ev.srcElement;
    var index = $(el).attr('data-index');
    var type = $(el).attr('data-type');

    var whenDone = Q.defer();
    var builder = new this.typeToConstructor[type]({
      deferred: whenDone,
      fromObj: this.getChildViews()[index]
    });
    whenDone.promise
    .then(_.bind(function() {
      var newView = {
        type: type,
        options: builder.getExportObj()
      };
      var views = this.getChildViews();
      views[index] = newView;
      this.setChildViews(views);
    }, this))
    .fail(function() { })
    .done();
  },

  deleteOneView: function(ev) {
    var el = ev.srcElement;
    var index = $(el).attr('data-index');
    var toSlice = this.getChildViews();

    var updated = toSlice.slice(0,index).concat(toSlice.slice(index + 1));
    this.setChildViews(updated);
    this.update();
  },

  addChildViewObj: function(newObj, index) {
    var childViews = this.getChildViews();
    childViews.push(newObj);
    this.setChildViews(childViews);
    this.update();
  },

  setChildViews: function(newArray) {
    this.multiViewJSON.childViews = newArray;
  },

  getChildViews: function() {
    return this.multiViewJSON.childViews || [];
  },

  update: function() {
    this.JSON.views = this.getChildViews();
    this.renderAgain();
  }
});

exports.MarkdownGrabber = MarkdownGrabber;
exports.DemonstrationBuilder = DemonstrationBuilder;
exports.TextGrabber = TextGrabber;
exports.MultiViewBuilder = MultiViewBuilder;
exports.MarkdownPresenter = MarkdownPresenter;


});
require("/src/js/views/builderViews.js");

require.define("/src/js/views/commandViews.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var CommandEntryCollection = require('../models/collections').CommandEntryCollection;
var Main = require('../app');
var Command = require('../models/commandModel').Command;
var CommandEntry = require('../models/commandModel').CommandEntry;

var Errors = require('../util/errors');
var Warning = Errors.Warning;

var util = require('../util');
var keyboard = require('../util/keyboard');

var CommandPromptView = Backbone.View.extend({
  initialize: function(options) {
    Main.getEvents().on('commandSubmittedPassive', this.addToCommandHistory, this);

    // uses local storage
    this.commands = new CommandEntryCollection();
    this.commands.fetch({
      success: _.bind(function() {
        // reverse the commands. this is ugly but needs to be done...
        var commands = [];
        this.commands.each(function(c) {
          commands.push(c);
        });

        commands.reverse();
        this.commands.reset();

        _.each(commands, function(c) {
          this.commands.add(c);
        }, this);
      }, this)
    });

    this.index = -1;
    this.commandParagraph = this.$('#prompt p.command')[0];
    this.commandCursor = this.$('#prompt span.cursor')[0];
    this.focus();

    Main.getEvents().on('rollupCommands', this.rollupCommands, this);

    Main.getEventBaton().stealBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().stealBaton('keyup', this.onKeyUp, this);
  },

  events: {
    'blur #commandTextField': 'hideCursor',
    'focus #commandTextField': 'showCursor'
  },

  blur: function() {
    this.hideCursor();
  },

  focus: function() {
    this.$('#commandTextField').focus();
    this.showCursor();
  },

  hideCursor: function() {
    this.toggleCursor(false);
  },

  showCursor: function() {
    this.toggleCursor(true);
  },

  toggleCursor: function(state) {
    $(this.commandCursor).toggleClass('shown', state);
  },

  onKeyDown: function(e) {
    var el = e.srcElement;
    this.updatePrompt(el);
  },

  onKeyUp: function(e) {
    this.onKeyDown(e);

    // we need to capture some of these events.
    var keyToFuncMap = {
      enter: _.bind(function() {
        this.submit();
      }, this),
      up: _.bind(function() {
        this.commandSelectChange(1);
      }, this),
      down: _.bind(function() {
        this.commandSelectChange(-1);
      }, this)
    };

    var key = keyboard.mapKeycodeToKey(e.which || e.keyCode);
    if (keyToFuncMap[key] !== undefined) {
      e.preventDefault();
      keyToFuncMap[key]();
      this.onKeyDown(e);
    }
  },

  badHtmlEncode: function(text) {
    return text.replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/</g,'&lt;')
      .replace(/ /g,'&nbsp;')
      .replace(/\n/g,'');
  },

  updatePrompt: function(el) {
    el = el || {};  // firefox
    // i WEEEPPPPPPpppppppppppp that this reflow takes so long. it adds this
    // super annoying delay to every keystroke... I have tried everything
    // to make this more performant. getting the srcElement from the event,
    // getting the value directly from the dom, etc etc. yet still,
    // there's a very annoying and sightly noticeable command delay.
    // try.github.com also has this, so I'm assuming those engineers gave up as
    // well...
    var text = $('#commandTextField').val();
    var val = this.badHtmlEncode(text);
    this.commandParagraph.innerHTML = val;

    // now mutate the cursor...
    this.cursorUpdate(text.length, el.selectionStart, el.selectionEnd);
    // and scroll down due to some weird bug
    Main.getEvents().trigger('commandScrollDown');
  },

  cursorUpdate: function(commandLength, selectionStart, selectionEnd) {
    if (selectionStart === undefined || selectionEnd === undefined) {
      selectionStart = commandLength - 1;
      selectionEnd = commandLength;
    }

    // 10px for monospaced font at "1" zoom
    var zoom = require('../util/zoomLevel').detectZoom();
    var widthPerChar = 10 * zoom;
    var heightPerRow = 22 * zoom;

    var widthOfParagraph = $(this.commandParagraph).width();
    var numCharsPerLine = widthOfParagraph / widthPerChar;

    var numCharsSelected = Math.min(Math.max(1, selectionEnd - selectionStart), numCharsPerLine);
    var widthOfSelection = String(numCharsSelected * widthPerChar) + 'px';

    // now for positioning
    var leftOffset = String(widthPerChar * (selectionStart % numCharsPerLine)) + 'px';
    var topOffset = String(Math.floor(selectionStart / numCharsPerLine) * heightPerRow) + 'px';

    // one reflow? :D
    $(this.commandCursor).css({
      width: widthOfSelection,
      left: leftOffset,
      top: topOffset
    });
  },

  commandSelectChange: function(delta) {
    this.index += delta;

    // if we are over / under, display blank line. yes this eliminates your
    // partially edited command, but i doubt that is much in this demo
    if (this.index >= this.commands.length || this.index < 0) {
      this.clear();
      this.index = -1;
      return;
    }

    // yay! we actually can display something
    var commandEntry = this.commands.toArray()[this.index].get('text');
    this.setTextField(commandEntry);
  },

  clearLocalStorage: function() {
    this.commands.each(function(c) {
      Backbone.sync('delete', c, function() { });
    }, this);
  },

  setTextField: function(value) {
    this.$('#commandTextField').val(value);
  },

  clear: function() {
    this.setTextField('');
  },

  submit: function() {
    var value = this.$('#commandTextField').val().replace('\n', '');
    this.clear();

    this.submitCommand(value);
    this.index = -1;
  },

  rollupCommands: function(numBack) {
    var which = this.commands.toArray().slice(1, Number(numBack) + 1);
    which.reverse();

    var str = '';
    _.each(which, function(commandEntry) {
      str += commandEntry.get('text') + ';';
    }, this);

    var rolled = new CommandEntry({text: str});
    this.commands.unshift(rolled);
    Backbone.sync('create', rolled, function() { });
  },

  addToCommandHistory: function(value) {
    // we should add the command to our local storage history
    // if it's not a blank line and this is a new command...
    // or if we edited the command in place in history
    var shouldAdd = (value.length && this.index === -1) ||
      ((value.length && this.index !== -1 &&
      this.commands.toArray()[this.index].get('text') !== value));

    if (!shouldAdd) {
      return;
    }

    var commandEntry = new CommandEntry({text: value});
    this.commands.unshift(commandEntry);

    // store to local storage
    Backbone.sync('create', commandEntry, function() { });

    // if our length is too egregious, reset
    if (this.commands.length > 100) {
      this.clearLocalStorage();
    }
  },

  submitCommand: function(value) {
    Main.getEventBaton().trigger('commandSubmitted', value);
  }
});

// This is the view for all commands -- it will represent
// their status (inqueue, processing, finished, error),
// their value ("git commit --amend"),
// and the result (either errors or warnings or whatever)
var CommandView = Backbone.View.extend({
  tagName: 'div',
  model: Command,
  template: _.template($('#command-template').html()),

  events: {
    'click': 'clicked'
  },

  clicked: function(e) {
  },

  initialize: function() {
    this.model.bind('change', this.wasChanged, this);
    this.model.bind('destroy', this.remove, this);
  },

  wasChanged: function(model, changeEvent) {
    // for changes that are just comestic, we actually only want to toggle classes
    // with jquery rather than brutally delete a html. doing so allows us
    // to nicely fade things
    var changes = changeEvent.changes;
    var changeKeys = _.keys(changes);
    if (_.difference(changeKeys, ['status']).length === 0) {
      this.updateStatus();
    } else {
      this.render();
    }
  },

  updateStatus: function() {
    var statuses = ['inqueue', 'processing', 'finished'];
    var toggleMap = {};
    _.each(statuses, function(status) {
      toggleMap[status] = false;
    });
    toggleMap[this.model.get('status')] = true;

    var query = this.$('p.commandLine');

    _.each(toggleMap, function(value, key) {
      query.toggleClass(key, value);
    });
  },

  render: function() {
    var json = _.extend(
      {
        resultType: '',
        result: '',
        formattedWarnings: this.model.getFormattedWarnings()
      },
      this.model.toJSON()
    );

    this.$el.html(this.template(json));
    return this;
  },

  remove: function() {
    $(this.el).hide();
  }
});


var CommandLineHistoryView = Backbone.View.extend({
  initialize: function(options) {
    this.collection = options.collection;

    this.collection.on('add', this.addOne, this);
    this.collection.on('reset', this.addAll, this);
    this.collection.on('all', this.render, this);

    this.collection.on('change', this.scrollDown, this);
    Main.getEvents().on('commandScrollDown', this.scrollDown, this);
    Main.getEvents().on('clearOldCommands', this.clearOldCommands, this);
  },

  addWarning: function(msg) {
    var err = new Warning({
      msg: msg
    });

    var command = new Command({
      error: err,
      rawStr: 'Warning:'
    });

    this.collection.add(command);
  },

  clearOldCommands: function() {
    // go through and get rid of every command that is "processed" or done
    var toDestroy = [];

    this.collection.each(function(command) {
      if (command.get('status') !== 'inqueue' &&
          command.get('status') !== 'processing') {
        toDestroy.push(command);
      }
    }, this);

    _.each(toDestroy, function(command) {
      command.destroy();
    }, this);
    this.scrollDown();
  },

  scrollDown: function() {
    // if commandDisplay is ever bigger than #terminal, we need to
    // add overflow-y to terminal and scroll down
    var cD = $('#commandDisplay')[0];
    var t = $('#terminal')[0];

    var shouldScroll = (cD.clientHeight > t.clientHeight);
    $(t).toggleClass('scrolling', shouldScroll);
    if (shouldScroll) {
      t.scrollTop = t.scrollHeight;
    }
  },

  addOne: function(command) {
    var view = new CommandView({
      model: command
    });
    this.$('#commandDisplay').append(view.render().el);
    this.scrollDown();
  },

  addAll: function() {
    this.collection.each(this.addOne);
  }
});

exports.CommandPromptView = CommandPromptView;
exports.CommandLineHistoryView = CommandLineHistoryView;


});
require("/src/js/views/commandViews.js");

require.define("/src/js/views/gitDemonstrationView.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var KeyboardListener = require('../util/keyboard').KeyboardListener;
var Command = require('../models/commandModel').Command;

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;

var Visualization = require('../visuals/visualization').Visualization;

var GitDemonstrationView = ContainedBase.extend({
  tagName: 'div',
  className: 'gitDemonstrationView box horizontal',
  template: _.template($('#git-demonstration-view').html()),

  events: {
    'click div.command > p.uiButton': 'positive'
  },

  initialize: function(options) {
    options = options || {};
    this.options = options;
    this.JSON = _.extend(
      {
        beforeMarkdowns: [
          '## Git Commits',
          '',
          'Awesome!'
        ],
        command: 'git commit',
        afterMarkdowns: [
          'Now you have seen it in action',
          '',
          'Go ahead and try the level!'
        ]
      },
      options
    );

    var convert = function(markdowns) {
      return require('markdown').markdown.toHTML(markdowns.join('\n'));
    };

    this.JSON.beforeHTML = convert(this.JSON.beforeMarkdowns);
    this.JSON.afterHTML = convert(this.JSON.afterMarkdowns);

    this.container = new ModalTerminal({
      title: options.title || 'Git Demonstration'
    });
    this.render();
    this.checkScroll();

    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('negative', this.negative, this);
    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        enter: 'positive',
        right: 'positive',
        left: 'negative'
      },
      wait: true
    });

    this.visFinished = false;
    this.initVis();

    if (!options.wait) {
      this.show();
    }
  },

  receiveMetaNav: function(navView, metaContainerView) {
    var _this = this;
    navView.navEvents.on('positive', this.positive, this);
    this.metaContainerView = metaContainerView;
  },

  checkScroll: function() {
    var children = this.$('div.demonstrationText').children();
    var heights = _.map(children, function(child) { return child.clientHeight; });
    var totalHeight = _.reduce(heights, function(a, b) { return a + b; });
    if (totalHeight < this.$('div.demonstrationText').height()) {
      this.$('div.demonstrationText').addClass('noLongText');
    }
  },

  dispatchBeforeCommand: function() {
    if (!this.options.beforeCommand) {
      return;
    }
    // here we just split the command and push them through to the git engine
    util.splitTextCommand(this.options.beforeCommand, function(commandStr) {
      this.mainVis.gitEngine.dispatch(new Command({
        rawStr: commandStr
      }), Q.defer());
    }, this);
    // then harsh refresh
    this.mainVis.gitVisuals.refreshTreeHarsh();
  },

  takeControl: function() {
    this.hasControl = true;
    this.keyboardListener.listen();

    if (this.metaContainerView) { this.metaContainerView.lock(); }
  },

  releaseControl: function() {
    if (!this.hasControl) { return; }
    this.hasControl = false;
    this.keyboardListener.mute();

    if (this.metaContainerView) { this.metaContainerView.unlock(); }
  },

  reset: function() {
    this.mainVis.reset();
    this.demonstrated = false;
    this.$el.toggleClass('demonstrated', false);
    this.$el.toggleClass('demonstrating', false);
  },

  positive: function() {
    if (this.demonstrated || !this.hasControl) {
      // dont do anything if we are demonstrating, and if
      // we receive a meta nav event and we aren't listening,
      // then dont do anything either
      return;
    }
    this.demonstrated = true;
    this.demonstrate();
  },

  demonstrate: function() {
    this.$el.toggleClass('demonstrating', true);

    var whenDone = Q.defer();
    this.dispatchCommand(this.JSON.command, whenDone);
    whenDone.promise.then(_.bind(function() {
      this.$el.toggleClass('demonstrating', false);
      this.$el.toggleClass('demonstrated', true);
      this.releaseControl();
    }, this));
  },

  negative: function(e) {
    if (this.$el.hasClass('demonstrating')) {
      return;
    }
    this.keyboardListener.passEventBack(e);
  },

  dispatchCommand: function(value, whenDone) {
    var commands = [];
    util.splitTextCommand(value, function(commandStr) {
      commands.push(new Command({
        rawStr: commandStr
      }));
    }, this);

    var chainDeferred = Q.defer();
    var chainPromise = chainDeferred.promise;

    _.each(commands, function(command, index) {
      chainPromise = chainPromise.then(_.bind(function() {
        var myDefer = Q.defer();
        this.mainVis.gitEngine.dispatch(command, myDefer);
        return myDefer.promise;
      }, this));
      chainPromise = chainPromise.then(function() {
        return Q.delay(300);
      });
    }, this);

    chainPromise = chainPromise.then(function() {
      whenDone.resolve();
    });

    chainDeferred.resolve();
  },

  tearDown: function() {
    this.mainVis.tearDown();
    GitDemonstrationView.__super__.tearDown.apply(this);
  },

  hide: function() {
    this.releaseControl();
    this.reset();
    if (this.visFinished) {
      this.mainVis.setTreeIndex(-1);
      this.mainVis.setTreeOpacity(0);
    }

    this.shown = false;
    GitDemonstrationView.__super__.hide.apply(this);
  },

  show: function() {
    this.takeControl();
    if (this.visFinished) {
      setTimeout(_.bind(function() {
        if (this.shown) {
          this.mainVis.setTreeIndex(300);
          this.mainVis.showHarsh();
        }
      }, this), this.getAnimationTime() * 1);
    }

    this.shown = true;
    GitDemonstrationView.__super__.show.apply(this);
  },

  die: function() {
    if (!this.visFinished) { return; }

    GitDemonstrationView.__super__.die.apply(this);
  },

  initVis: function() {
    this.mainVis = new Visualization({
      el: this.$('div.visHolder')[0],
      noKeyboardInput: true,
      noClick: true,
      smallCanvas: true,
      zIndex: -1
    });
    this.mainVis.customEvents.on('paperReady', _.bind(function() {
      this.visFinished = true;
      this.dispatchBeforeCommand();
      if (this.shown) {
        // show the canvas once its done if we are shown
        this.show();
      }
    }, this));
  }
});

exports.GitDemonstrationView = GitDemonstrationView;


});
require("/src/js/views/gitDemonstrationView.js");

require.define("/src/js/views/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var Main = require('../app');
var Constants = require('../util/constants');
var KeyboardListener = require('../util/keyboard').KeyboardListener;
var GitError = require('../util/errors').GitError;

var BaseView = Backbone.View.extend({
  getDestination: function() {
    return this.destination || this.container.getInsideElement();
  },

  tearDown: function() {
    this.$el.remove();
    if (this.container) {
      this.container.tearDown();
    }
  },

  renderAgain: function(HTML) {
    // flexibility
    HTML = HTML || this.template(this.JSON);
    this.$el.html(HTML);
  },

  render: function(HTML) {
    this.renderAgain(HTML);
    var destination = this.getDestination();
    $(destination).append(this.el);
  }
});

var ResolveRejectBase = BaseView.extend({
  resolve: function() {
    this.deferred.resolve();
  },

  reject: function() {
    this.deferred.reject();
  }
});

var PositiveNegativeBase = BaseView.extend({
  positive: function() {
    this.navEvents.trigger('positive');
  },

  negative: function() {
    this.navEvents.trigger('negative');
  }
});

var ContainedBase = BaseView.extend({
  getAnimationTime: function() { return 700; },

  show: function() {
    this.container.show();
  },

  hide: function() {
    this.container.hide();
  },

  die: function() {
    this.hide();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this), this.getAnimationTime() * 1.1);
  }
});

var GeneralButton = ContainedBase.extend({
  tagName: 'a',
  className: 'generalButton uiButton',
  template: _.template($('#general-button').html()),
  events: {
    'click': 'click'
  },

  initialize: function(options) {
    options = options || {};
    this.navEvents = options.navEvents || _.clone(Backbone.Events);
    this.destination = options.destination;
    if (!this.destination) {
      this.container = new ModalTerminal();
    }

    this.JSON = {
      buttonText: options.buttonText || 'General Button',
      wantsWrapper: (options.wantsWrapper !== undefined) ? options.wantsWrapper : true
    };

    this.render();

    if (this.container && !options.wait) {
      this.show();
    }
  },

  click: function() {
    if (!this.clickFunc) {
      this.clickFunc = _.throttle(
        _.bind(this.sendClick, this),
        500
      );
    }
    this.clickFunc();
  },

  sendClick: function() {
    this.navEvents.trigger('click');
  }
});

var ConfirmCancelView = ResolveRejectBase.extend({
  tagName: 'div',
  className: 'confirmCancelView box horizontal justify',
  template: _.template($('#confirm-cancel-template').html()),
  events: {
    'click .confirmButton': 'resolve',
    'click .cancelButton': 'reject'
  },

  initialize: function(options) {
    if (!options.destination) {
      throw new Error('needmore');
    }

    this.destination = options.destination;
    this.deferred = options.deferred || Q.defer();
    this.JSON = {
      confirm: options.confirm || 'Confirm',
      cancel: options.cancel || 'Cancel'
    };

    this.render();
  }
});

var LeftRightView = PositiveNegativeBase.extend({
  tagName: 'div',
  className: 'leftRightView box horizontal center',
  template: _.template($('#left-right-template').html()),
  events: {
    'click .left': 'negative',
    'click .right': 'positive'
  },

  positive: function() {
    this.pipeEvents.trigger('positive');
    LeftRightView.__super__.positive.apply(this);
  },

  negative: function() {
    this.pipeEvents.trigger('negative');
    LeftRightView.__super__.negative.apply(this);
  },

  initialize: function(options) {
    if (!options.destination || !options.events) {
      throw new Error('needmore');
    }

    this.destination = options.destination;

    // we switch to a system where every leftrightview has its own
    // events system to add support for git demonstration view taking control of the
    // click events
    this.pipeEvents = options.events;
    this.navEvents = _.clone(Backbone.Events);

    this.JSON = {
      showLeft: (options.showLeft === undefined) ? true : options.showLeft,
      lastNav: (options.lastNav === undefined) ? false : options.lastNav
    };

    this.render();
  }
});

var ModalView = Backbone.View.extend({
  tagName: 'div',
  className: 'modalView box horizontal center transitionOpacityLinear',
  template: _.template($('#modal-view-template').html()),

  getAnimationTime: function() { return 700; },

  initialize: function(options) {
    this.shown = false;
    this.render();
  },

  render: function() {
    // add ourselves to the DOM
    this.$el.html(this.template({}));
    $('body').append(this.el);
    // this doesnt necessarily show us though...
  },

  stealKeyboard: function() {
    Main.getEventBaton().stealBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().stealBaton('keyup', this.onKeyUp, this);
    Main.getEventBaton().stealBaton('windowFocus', this.onWindowFocus, this);
    Main.getEventBaton().stealBaton('documentClick', this.onDocumentClick, this);

    // blur the text input field so keydown events will not be caught by our
    // preventDefaulters, allowing people to still refresh and launch inspector (etc)
    $('#commandTextField').blur();
  },

  releaseKeyboard: function() {
    Main.getEventBaton().releaseBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().releaseBaton('keyup', this.onKeyUp, this);
    Main.getEventBaton().releaseBaton('windowFocus', this.onWindowFocus, this);
    Main.getEventBaton().releaseBaton('documentClick', this.onDocumentClick, this);

    Main.getEventBaton().trigger('windowFocus');
  },

  onWindowFocus: function(e) {
    //console.log('window focus doing nothing', e);
  },

  onDocumentClick: function(e) {
    //console.log('doc click doing nothing', e);
  },

  onKeyDown: function(e) {
    e.preventDefault();
  },

  onKeyUp: function(e) {
    e.preventDefault();
  },

  show: function() {
    this.toggleZ(true);
    // on reflow, change our class to animate. for whatever
    // reason if this is done immediately, chrome might combine
    // the two changes and lose the ability to animate and it looks bad.
    process.nextTick(_.bind(function() {
      this.toggleShow(true);
    }, this));
  },

  hide: function() {
    this.toggleShow(false);
    setTimeout(_.bind(function() {
      // if we are still hidden...
      if (!this.shown) {
        this.toggleZ(false);
      }
    }, this), this.getAnimationTime());
  },

  getInsideElement: function() {
    return this.$('.contentHolder');
  },

  toggleShow: function(value) {
    // this prevents releasing keyboard twice
    if (this.shown === value) { return; }

    if (value) {
      this.stealKeyboard();
    } else {
      this.releaseKeyboard();
    }

    this.shown = value;
    this.$el.toggleClass('show', value);
  },

  toggleZ: function(value) {
    this.$el.toggleClass('inFront', value);
  },

  tearDown: function() {
    this.$el.html('');
    $('body')[0].removeChild(this.el);
  }
});

var ModalTerminal = ContainedBase.extend({
  tagName: 'div',
  className: 'modalTerminal box flex1',
  template: _.template($('#terminal-window-template').html()),
  events: {
    'click div.inside': 'onClick'
  },

  initialize: function(options) {
    options = options || {};
    this.navEvents = options.events || _.clone(Backbone.Events);

    this.container = new ModalView();
    this.JSON = {
      title: options.title || 'Heed This Warning!'
    };

    this.render();
  },

  onClick: function() {
    this.navEvents.trigger('click');
  },

  getInsideElement: function() {
    return this.$('.inside');
  }
});

var ModalAlert = ContainedBase.extend({
  tagName: 'div',
  template: _.template($('#modal-alert-template').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      title: options.title || 'Something to say',
      text: options.text || 'Here is a paragraph',
      markdown: options.markdown
    };

    if (options.markdowns) {
      this.JSON.markdown = options.markdowns.join('\n');
    }

    this.container = new ModalTerminal({
      title: 'Alert!'
    });
    this.render();

    if (!options.wait) {
      this.show();
    }
  },

  render: function() {
    var HTML = (this.JSON.markdown) ?
      require('markdown').markdown.toHTML(this.JSON.markdown) :
      this.template(this.JSON);

    // call to super, not super elegant but better than
    // copy paste code
    ModalAlert.__super__.render.apply(this, [HTML]);
  }
});

var ConfirmCancelTerminal = Backbone.View.extend({
  initialize: function(options) {
    options = options || {};

    this.deferred = options.deferred || Q.defer();
    this.modalAlert = new ModalAlert(_.extend(
      {},
      { markdown: '#you sure?' },
      options
    ));

    var buttonDefer = Q.defer();
    this.buttonDefer = buttonDefer;
    this.confirmCancel = new ConfirmCancelView({
      deferred: buttonDefer,
      destination: this.modalAlert.getDestination()
    });

    // whenever they hit a button. make sure
    // we close and pass that to our deferred
    buttonDefer.promise
    .then(this.deferred.resolve)
    .fail(this.deferred.reject)
    .done(_.bind(function() {
      this.close();
    }, this));

    // also setup keyboard
    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('negative', this.negative, this);
    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        enter: 'positive',
        esc: 'negative'
      }
    });

    if (!options.wait) {
      this.modalAlert.show();
    }
  },

  positive: function() {
    this.buttonDefer.resolve();
  },

  negative: function() {
    this.buttonDefer.reject();
  },

  getAnimationTime: function() { return 700; },

  show: function() {
    this.modalAlert.show();
  },

  hide: function() {
    this.modalAlert.hide();
  },

  getPromise: function() {
    return this.deferred.promise;
  },

  close: function() {
    this.keyboardListener.mute();
    this.modalAlert.die();
  }
});

var NextLevelConfirm = ConfirmCancelTerminal.extend({
  initialize: function(options) {
    options = options || {};
    var nextLevelName = (options.nextLevel) ? options.nextLevel.name : '';

    var markdowns = [
      '## Great Job!!',
      '',
      'You solved the level in **' + options.numCommands + '** command(s); ',
      'our solution uses ' + options.best + '. '
    ];

    if (options.numCommands <= options.best) {
      markdowns.push(
        'Awesome! You matched or exceeded our solution. '
      );
    } else {
      markdowns.push(
        'See if you can whittle it down to ' + options.best + ' command(s) :D '
      );
    }

    if (options.nextLevel) {
      markdowns = markdowns.concat([
        '',
        'Would you like to move onto "',
        nextLevelName + '", the next level?'
      ]);
    } else {
      markdowns = markdowns.concat([
        '',
        'Wow!!! You finished the last level, congratulations!'
      ]);
    }

    options = _.extend(
      {},
      options,
      { markdowns: markdowns }
    );

    NextLevelConfirm.__super__.initialize.apply(this, [options]);
  }
});

var ViewportAlert = Backbone.View.extend({
  initialize: function(options) {
    this.grabBatons();
    this.modalAlert = new ModalAlert({
      markdowns: this.markdowns
    });
    this.modalAlert.show();
  },

  grabBatons: function() {
    Main.getEventBaton().stealBaton(this.eventBatonName, this.batonFired, this);
  },

  releaseBatons: function() {
    Main.getEventBaton().releaseBaton(this.eventBatonName, this.batonFired, this);
  },

  finish: function() {
    this.releaseBatons();
    this.modalAlert.die();
  }
});

var WindowSizeAlertWindow = ViewportAlert.extend({
  initialize: function(options) {
    this.eventBatonName = 'windowSizeCheck';
    this.markdowns = [
      '## That window size is not supported :-/',
      'Please resize your window back to a supported size',
      '',
      '(and of course, pull requests to fix this are appreciated :D)'
    ];
    WindowSizeAlertWindow.__super__.initialize.apply(this, [options]);
  },

  batonFired: function(size) {
    if (size.w > Constants.VIEWPORT.minWidth &&
        size.h > Constants.VIEWPORT.minHeight) {
      this.finish();
    }
  }
});

var ZoomAlertWindow = ViewportAlert.extend({
  initialize: function(options) {
    if (!options || !options.level) { throw new Error('need level'); }

    this.eventBatonName = 'zoomChange';
    this.markdowns = [
      '## That zoom level of ' + options.level + ' is not supported :-/',
      'Please zoom back to a supported zoom level with Ctrl + and Ctrl -',
      '',
      '(and of course, pull requests to fix this are appreciated :D)'
    ];
    ZoomAlertWindow.__super__.initialize.apply(this, [options]);
  },

  batonFired: function(level) {
    if (level <= Constants.VIEWPORT.maxZoom &&
        level >= Constants.VIEWPORT.minZoom) {
      this.finish();
    }
  }
});

var LevelToolbar = BaseView.extend({
  tagName: 'div',
  className: 'levelToolbarHolder',
  template: _.template($('#level-toolbar-template').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      name: options.name || 'Some level! (unknown name)'
    };

    this.beforeDestination = $($('#commandLineHistory div.toolbar')[0]);
    this.render();

    if (!options.wait) {
      process.nextTick(_.bind(this.show, this));
    }
  },

  getAnimationTime: function() { return 700; },

  render: function() {
    var HTML = this.template(this.JSON);

    this.$el.html(HTML);
    this.beforeDestination.after(this.el);
  },

  die: function() {
    this.hide();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this), this.getAnimationTime());
  },

  hide: function() {
    this.$('div.toolbar').toggleClass('hidden', true);
  },

  show: function() {
    this.$('div.toolbar').toggleClass('hidden', false);
  }
});

var CanvasTerminalHolder = BaseView.extend({
  tagName: 'div',
  className: 'canvasTerminalHolder box flex1',
  template: _.template($('#terminal-window-bare-template').html()),
  events: {
    'click div.wrapper': 'onClick'
  },

  initialize: function(options) {
    options = options || {};
    this.destination = $('body');
    this.JSON = {
      title: options.title || 'Goal To Reach',
      text: options.text || 'You can hide this window with "hide goal"'
    };

    this.render();

    if (options.additionalClass) {
      this.$el.addClass(options.additionalClass);
    }
  },

  getAnimationTime: function() { return 700; },

  onClick: function() {
    this.slideOut();
  },

  die: function() {
    this.slideOut();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this));
  },

  slideOut: function() {
    this.slideToggle(true);
  },

  slideIn: function() {
    this.slideToggle(false);
  },

  slideToggle: function(value) {
    this.$('div.terminal-window-holder').toggleClass('slideOut', value);
  },

  getCanvasLocation: function() {
    return this.$('div.inside')[0];
  }
});

exports.BaseView = BaseView;
exports.GeneralButton = GeneralButton;
exports.ModalView = ModalView;
exports.ModalTerminal = ModalTerminal;
exports.ModalAlert = ModalAlert;
exports.ContainedBase = ContainedBase;
exports.ConfirmCancelView = ConfirmCancelView;
exports.LeftRightView = LeftRightView;
exports.ZoomAlertWindow = ZoomAlertWindow;
exports.ConfirmCancelTerminal = ConfirmCancelTerminal;
exports.WindowSizeAlertWindow = WindowSizeAlertWindow;

exports.CanvasTerminalHolder = CanvasTerminalHolder;
exports.LevelToolbar = LevelToolbar;
exports.NextLevelConfirm = NextLevelConfirm;


});
require("/src/js/views/index.js");

require.define("/src/js/views/levelDropdownView.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var util = require('../util');
var KeyboardListener = require('../util/keyboard').KeyboardListener;
var Main = require('../app');

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;
var BaseView = require('../views').BaseView;

var LevelDropdownView = ContainedBase.extend({
  tagName: 'div',
  className: 'levelDropdownView box vertical',
  template: _.template($('#level-dropdown-view').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {};

    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('clickedID', _.debounce(
      _.bind(this.loadLevelID, this),
      300,
      true
    ));
    this.navEvents.on('negative', this.negative, this);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('left', this.left, this);
    this.navEvents.on('right', this.right, this);
    this.navEvents.on('up', this.up, this);
    this.navEvents.on('down', this.down, this);

    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        esc: 'negative',
        enter: 'positive'
      },
      wait: true
    });

    this.sequences = Main.getLevelArbiter().getSequences();
    this.sequenceToLevels = Main.getLevelArbiter().getSequenceToLevels();

    this.container = new ModalTerminal({
      title: 'Select a Level'
    });
    this.render();
    this.buildSequences();

    if (!options.wait) {
      this.show();
    }
  },

  positive: function() {
    if (!this.selectedID) {
      return;
    }
    this.loadLevelID(this.selectedID);
  },

  left: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.leftOrRight(-1);
  },

  leftOrRight: function(delta) {
    this.deselectIconByID(this.selectedID);
    this.selectedIndex = this.wrapIndex(this.selectedIndex + delta, this.getCurrentSequence());
    this.selectedID = this.getSelectedID();
    this.selectIconByID(this.selectedID);
  },

  right: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.leftOrRight(1);
  },

  up: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.selectedSequence = this.getPreviousSequence();
    this.downOrUp();
  },

  down: function() {
    if (this.turnOnKeyboardSelection()) {
      return;
    }
    this.selectedSequence = this.getNextSequence();
    this.downOrUp();
  },

  downOrUp: function() {
    this.selectedIndex = this.boundIndex(this.selectedIndex, this.getCurrentSequence());
    this.deselectIconByID(this.selectedID);
    this.selectedID = this.getSelectedID();
    this.selectIconByID(this.selectedID);
  },

  turnOnKeyboardSelection: function() {
    if (!this.selectedID) {
      this.selectFirst();
      return true;
    }
    return false;
  },

  turnOffKeyboardSelection: function() {
    if (!this.selectedID) { return; }
    this.deselectIconByID(this.selectedID);
    this.selectedID = undefined;
    this.selectedIndex = undefined;
    this.selectedSequence = undefined;
  },

  wrapIndex: function(index, arr) {
    index = (index >= arr.length) ? 0 : index;
    index = (index < 0) ? arr.length - 1 : index;
    return index;
  },

  boundIndex: function(index, arr) {
    index = (index >= arr.length) ? arr.length - 1 : index;
    index = (index < 0) ? 0 : index;
    return index;
  },

  getNextSequence: function() {
    var current = this.getSequenceIndex(this.selectedSequence);
    var desired = this.wrapIndex(current + 1, this.sequences);
    return this.sequences[desired];
  },

  getPreviousSequence: function() {
    var current = this.getSequenceIndex(this.selectedSequence);
    var desired = this.wrapIndex(current - 1, this.sequences);
    return this.sequences[desired];
  },

  getSequenceIndex: function(name) {
    var index = this.sequences.indexOf(name);
    if (index < 0) { throw new Error('didnt find'); }
    return index;
  },

  getIndexForID: function(id) {
    return Main.getLevelArbiter().getLevel(id).index;
  },

  selectFirst: function() {
    var firstID = this.sequenceToLevels[this.sequences[0]][0].id;
    this.selectIconByID(firstID);
    this.selectedIndex = 0;
    this.selectedSequence = this.sequences[0];
  },

  getCurrentSequence: function() {
    return this.sequenceToLevels[this.selectedSequence];
  },

  getSelectedID: function() {
    return this.sequenceToLevels[this.selectedSequence][this.selectedIndex].id;
  },

  selectIconByID: function(id) {
    this.toggleIconSelect(id, true);
  },

  deselectIconByID: function(id) {
    this.toggleIconSelect(id, false);
  },

  toggleIconSelect: function(id, value) {
    this.selectedID = id;
    var selector = '#levelIcon-' + id;
    $(selector).toggleClass('selected', value);
  },

  negative: function() {
    this.hide();
  },

  testOption: function(str) {
    return this.currentCommand && new RegExp('--' + str).test(this.currentCommand.get('rawStr'));
  },

  show: function(deferred, command) {
    this.currentCommand = command;
    // doing the update on show will allow us to fade which will be nice
    this.updateSolvedStatus();

    this.showDeferred = deferred;
    this.keyboardListener.listen();
    LevelDropdownView.__super__.show.apply(this);
  },

  hide: function() {
    if (this.showDeferred) {
      this.showDeferred.resolve();
    }
    this.showDeferred = undefined;
    this.keyboardListener.mute();
    this.turnOffKeyboardSelection();

    LevelDropdownView.__super__.hide.apply(this);
  },

  loadLevelID: function(id) {
    if (!this.testOption('noOutput')) {
      Main.getEventBaton().trigger(
        'commandSubmitted',
        'level ' + id
      );
    }
    this.hide();
  },

  updateSolvedStatus: function() {
    _.each(this.seriesViews, function(view) {
      view.updateSolvedStatus();
    }, this);
  },

  buildSequences: function() {
    this.seriesViews = [];
    _.each(this.sequences, function(sequenceName) {
      this.seriesViews.push(new SeriesView({
        destination: this.$el,
        name: sequenceName,
        navEvents: this.navEvents
      }));
    }, this);
  }
});

var SeriesView = BaseView.extend({
  tagName: 'div',
  className: 'seriesView box flex1 vertical',
  template: _.template($('#series-view').html()),
  events: {
    'click div.levelIcon': 'click'
  },

  initialize: function(options) {
    this.name = options.name || 'intro';
    this.navEvents = options.navEvents;
    this.info = Main.getLevelArbiter().getSequenceInfo(this.name);
    this.levels = Main.getLevelArbiter().getLevelsInSequence(this.name);

    this.levelIDs = [];
    _.each(this.levels, function(level) {
      this.levelIDs.push(level.id);
    }, this);

    this.destination = options.destination;
    this.JSON = {
      displayName: this.info.displayName,
      about: this.info.about,
      ids: this.levelIDs
    };

    this.render();
    this.updateSolvedStatus();
  },

  updateSolvedStatus: function() {
    // this is a bit hacky, it really should be some nice model
    // property changing but it's the 11th hour...
    var toLoop = this.$('div.levelIcon').each(function(index, el) {
      var id = $(el).attr('data-id');
      $(el).toggleClass('solved', Main.getLevelArbiter().isLevelSolved(id));
    });
  },

  click: function(ev) {
    var element = ev.srcElement || ev.currentTarget;
    if (!element) {
      console.warn('wut, no id'); return;
    }

    var id = $(element).attr('data-id');
    this.navEvents.trigger('clickedID', id);
  }
});

exports.LevelDropdownView = LevelDropdownView;


});
require("/src/js/views/levelDropdownView.js");

require.define("/src/js/views/multiView.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;
var ConfirmCancelView = require('../views').ConfirmCancelView;
var LeftRightView = require('../views').LeftRightView;
var ModalAlert = require('../views').ModalAlert;
var GitDemonstrationView = require('../views/gitDemonstrationView').GitDemonstrationView;

var BuilderViews = require('../views/builderViews');
var MarkdownPresenter = BuilderViews.MarkdownPresenter;

var KeyboardListener = require('../util/keyboard').KeyboardListener;
var GitError = require('../util/errors').GitError;

var MultiView = Backbone.View.extend({
  tagName: 'div',
  className: 'multiView',
  // ms to debounce the nav functions
  navEventDebounce: 550,
  deathTime: 700,

  // a simple mapping of what childViews we support
  typeToConstructor: {
    ModalAlert: ModalAlert,
    GitDemonstrationView: GitDemonstrationView,
    MarkdownPresenter: MarkdownPresenter
  },

  initialize: function(options) {
    options = options || {};
    this.childViewJSONs = options.childViews || [{
      type: 'ModalAlert',
      options: {
        markdown: 'Woah wtf!!'
      }
     }, {
       type: 'GitDemonstrationView',
       options: {
         command: 'git checkout -b side; git commit; git commit'
       }
     }, {
      type: 'ModalAlert',
      options: {
        markdown: 'Im second'
      }
    }];
    this.deferred = options.deferred || Q.defer();

    this.childViews = [];
    this.currentIndex = 0;

    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('negative', this.getNegFunc(), this);
    this.navEvents.on('positive', this.getPosFunc(), this);
    this.navEvents.on('quit', this.finish, this);

    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        left: 'negative',
        right: 'positive',
        enter: 'positive',
        esc: 'quit'
      }
    });

    this.render();
    if (!options.wait) {
      this.start();
    }
  },

  onWindowFocus: function() {
    // nothing here for now...
    // TODO -- add a cool glow effect?
  },

  getAnimationTime: function() {
    return 700;
  },

  getPromise: function() {
    return this.deferred.promise;
  },

  getPosFunc: function() {
    return _.debounce(_.bind(function() {
      this.navForward();
    }, this), this.navEventDebounce, true);
  },

  getNegFunc: function() {
    return _.debounce(_.bind(function() {
      this.navBackward();
    }, this), this.navEventDebounce, true);
  },

  lock: function() {
    this.locked = true;
  },

  unlock: function() {
    this.locked = false;
  },

  navForward: function() {
    // we need to prevent nav changes when a git demonstration view hasnt finished
    if (this.locked) { return; }
    if (this.currentIndex === this.childViews.length - 1) {
      this.hideViewIndex(this.currentIndex);
      this.finish();
      return;
    }

    this.navIndexChange(1);
  },

  navBackward: function() {
    if (this.currentIndex === 0) {
      return;
    }

    this.navIndexChange(-1);
  },

  navIndexChange: function(delta) {
    this.hideViewIndex(this.currentIndex);
    this.currentIndex += delta;
    this.showViewIndex(this.currentIndex);
  },

  hideViewIndex: function(index) {
    this.childViews[index].hide();
  },

  showViewIndex: function(index) {
    this.childViews[index].show();
  },

  finish: function() {
    // first we stop listening to keyboard and give that back to UI, which
    // other views will take if they need to
    this.keyboardListener.mute();

    _.each(this.childViews, function(childView) {
      childView.die();
    });

    this.deferred.resolve();
  },

  start: function() {
    // steal the window focus baton
    this.showViewIndex(this.currentIndex);
  },

  createChildView: function(viewJSON) {
    var type = viewJSON.type;
    if (!this.typeToConstructor[type]) {
      throw new Error('no constructor for type "' + type + '"');
    }
    var view = new this.typeToConstructor[type](_.extend(
      {},
      viewJSON.options,
      { wait: true }
    ));
    return view;
  },

  addNavToView: function(view, index) {
    var leftRight = new LeftRightView({
      events: this.navEvents,
      // we want the arrows to be on the same level as the content (not
      // beneath), so we go one level up with getDestination()
      destination: view.getDestination(),
      showLeft: (index !== 0),
      lastNav: (index === this.childViewJSONs.length - 1)
    });
    if (view.receiveMetaNav) {
      view.receiveMetaNav(leftRight, this);
    }
  },

  render: function() {
    // go through each and render... show the first
    _.each(this.childViewJSONs, function(childViewJSON, index) {
      var childView = this.createChildView(childViewJSON);
      this.childViews.push(childView);
      this.addNavToView(childView, index);
    }, this);
  }
});

exports.MultiView = MultiView;


});
require("/src/js/views/multiView.js");

require.define("/src/js/views/rebaseView.js",function(require,module,exports,__dirname,__filename,process,global){var GitError = require('../util/errors').GitError;
var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var ModalTerminal = require('../views').ModalTerminal;
var ContainedBase = require('../views').ContainedBase;
var ConfirmCancelView = require('../views').ConfirmCancelView;
var LeftRightView = require('../views').LeftRightView;

var InteractiveRebaseView = ContainedBase.extend({
  tagName: 'div',
  template: _.template($('#interactive-rebase-template').html()),

  initialize: function(options) {
    this.deferred = options.deferred;
    this.rebaseMap = {};
    this.entryObjMap = {};

    this.rebaseEntries = new RebaseEntryCollection();
    options.toRebase.reverse();
    _.each(options.toRebase, function(commit) {
      var id = commit.get('id');
      this.rebaseMap[id] = commit;

      // make basic models for each commit
      this.entryObjMap[id] = new RebaseEntry({
        id: id
      });
      this.rebaseEntries.add(this.entryObjMap[id]);
    }, this);

    this.container = new ModalTerminal({
      title: 'Interactive Rebase'
    });
    this.render();

    // show the dialog holder
    this.show();
  },

  confirm: function() {
    this.die();

    // get our ordering
    var uiOrder = [];
    this.$('ul.rebaseEntries li').each(function(i, obj) {
      uiOrder.push(obj.id);
    });

    // now get the real array
    var toRebase = [];
    _.each(uiOrder, function(id) {
      // the model pick check
      if (this.entryObjMap[id].get('pick')) {
        toRebase.unshift(this.rebaseMap[id]);
      }
    }, this);
    toRebase.reverse();

    this.deferred.resolve(toRebase);
    // garbage collection will get us
    this.$el.html('');
  },

  render: function() {
    var json = {
      num: _.keys(this.rebaseMap).length
    };

    var destination = this.container.getInsideElement();
    this.$el.html(this.template(json));
    $(destination).append(this.el);

    // also render each entry
    var listHolder = this.$('ul.rebaseEntries');
    this.rebaseEntries.each(function(entry) {
      new RebaseEntryView({
        el: listHolder,
        model: entry
      });
    }, this);

    // then make it reorderable..
    listHolder.sortable({
      axis: 'y',
      placeholder: 'rebaseEntry transitionOpacity ui-state-highlight',
      appendTo: 'parent'
    });

    this.makeButtons();
  },

  makeButtons: function() {
    // control for button
    var deferred = Q.defer();
    deferred.promise
    .then(_.bind(function() {
      this.confirm();
    }, this))
    .fail(_.bind(function() {
      // empty array does nothing, just like in git
      this.hide();
      this.deferred.resolve([]);
    }, this))
    .done();

    // finally get our buttons
    new ConfirmCancelView({
      destination: this.$('.confirmCancel'),
      deferred: deferred
    });
  }
});

var RebaseEntry = Backbone.Model.extend({
  defaults: {
    pick: true
  },

  toggle: function() {
    this.set('pick', !this.get('pick'));
  }
});

var RebaseEntryCollection = Backbone.Collection.extend({
  model: RebaseEntry
});

var RebaseEntryView = Backbone.View.extend({
  tagName: 'li',
  template: _.template($('#interactive-rebase-entry-template').html()),

  toggle: function() {
    this.model.toggle();

    // toggle a class also
    this.listEntry.toggleClass('notPicked', !this.model.get('pick'));
  },

  initialize: function(options) {
    this.render();
  },

  render: function() {
    var json = this.model.toJSON();
    this.$el.append(this.template(this.model.toJSON()));

    // hacky :( who would have known jquery barfs on ids with %'s and quotes
    this.listEntry = this.$el.children(':last');

    this.listEntry.delegate('#toggleButton', 'click', _.bind(function() {
      this.toggle();
    }, this));
  }
});

exports.InteractiveRebaseView = InteractiveRebaseView;

});
require("/src/js/views/rebaseView.js");

require.define("/src/js/visuals/animation/animationFactory.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var Animation = require('./index').Animation;
var GRAPHICS = require('../../util/constants').GRAPHICS;

/******************
 * This class is responsible for a lot of the heavy lifting around creating an animation at a certain state in time.
 * The tricky thing is that when a new commit has to be "born," say in the middle of a rebase
 * or something, it must animate out from the parent position to it's birth position.

 * These two positions though may not be where the commit finally ends up. So we actually need to take a snapshot of the tree,
 * store all those positions, take a snapshot of the tree after a layout refresh afterwards, and then animate between those two spots.
 * and then essentially animate the entire tree too.
 */

// essentially a static class
var AnimationFactory = function() {

};

AnimationFactory.prototype.genCommitBirthAnimation = function(animationQueue, commit, gitVisuals) {
  if (!animationQueue) {
    throw new Error("Need animation queue to add closure to!");
  }

  var time = GRAPHICS.defaultAnimationTime * 1.0;
  var bounceTime = time * 2;

  // essentially refresh the entire tree, but do a special thing for the commit
  var visNode = commit.get('visNode');

  var animation = function() {
    // this takes care of refs and all that jazz, and updates all the positions
    gitVisuals.refreshTree(time);

    visNode.setBirth();
    visNode.parentInFront();
    gitVisuals.visBranchesFront();

    visNode.animateUpdatedPosition(bounceTime, 'bounce');
    visNode.animateOutgoingEdges(time);
  };

  animationQueue.add(new Animation({
    closure: animation,
    duration: Math.max(time, bounceTime)
  }));
};

AnimationFactory.prototype.overrideOpacityDepth2 = function(attr, opacity) {
  opacity = (opacity === undefined) ? 1 : opacity;

  var newAttr = {};

  _.each(attr, function(partObj, partName) {
    newAttr[partName] = {};
    _.each(partObj, function(val, key) {
      if (key == 'opacity') {
        newAttr[partName][key] = opacity;
      } else {
        newAttr[partName][key] = val;
      }
    });
  });
  return newAttr;
};

AnimationFactory.prototype.overrideOpacityDepth3 = function(snapShot, opacity) {
  var newSnap = {};

  _.each(snapShot, function(visObj, visID) {
    newSnap[visID] = this.overrideOpacityDepth2(visObj, opacity);
  }, this);
  return newSnap;
};

AnimationFactory.prototype.genCommitBirthClosureFromSnapshot = function(step, gitVisuals) {
  var time = GRAPHICS.defaultAnimationTime * 1.0;
  var bounceTime = time * 1.5;

  var visNode = step.newCommit.get('visNode');
  var afterAttrWithOpacity = this.overrideOpacityDepth2(step.afterSnapshot[visNode.getID()]);
  var afterSnapWithOpacity = this.overrideOpacityDepth3(step.afterSnapshot);

  var animation = function() {
    visNode.setBirthFromSnapshot(step.beforeSnapshot);
    visNode.parentInFront();
    gitVisuals.visBranchesFront();

    visNode.animateToAttr(afterAttrWithOpacity, bounceTime, 'bounce');
    visNode.animateOutgoingEdgesToAttr(afterSnapWithOpacity, bounceTime);
  };

  return animation;
};

AnimationFactory.prototype.refreshTree = function(animationQueue, gitVisuals) {
  animationQueue.add(new Animation({
    closure: function() {
      gitVisuals.refreshTree();
    }
  }));
};

AnimationFactory.prototype.rebaseAnimation = function(animationQueue, rebaseResponse,
                                                      gitEngine, gitVisuals) {

  this.rebaseHighlightPart(animationQueue, rebaseResponse, gitEngine);
  this.rebaseBirthPart(animationQueue, rebaseResponse, gitEngine, gitVisuals);
};

AnimationFactory.prototype.rebaseHighlightPart = function(animationQueue, rebaseResponse, gitEngine) {
  var fullTime = GRAPHICS.defaultAnimationTime * 0.66;
  var slowTime = fullTime * 2.0;

  // we want to highlight all the old commits
  var oldCommits = rebaseResponse.toRebaseArray;
  // we are either highlighting to a visBranch or a visNode
  var visBranch = rebaseResponse.destinationBranch.get('visBranch');
  if (!visBranch) {
    // in the case where we rebase onto a commit
    visBranch = rebaseResponse.destinationBranch.get('visNode');
  }

  _.each(oldCommits, function(oldCommit) {
    var visNode = oldCommit.get('visNode');
    animationQueue.add(new Animation({
      closure: function() {
        visNode.highlightTo(visBranch, slowTime, 'easeInOut');
      },
      duration: fullTime * 1.5
    }));

  }, this);

  this.delay(animationQueue, fullTime * 2);
};

AnimationFactory.prototype.rebaseBirthPart = function(animationQueue, rebaseResponse,
                                                      gitEngine, gitVisuals) {
  var rebaseSteps = rebaseResponse.rebaseSteps;

  var newVisNodes = [];
  _.each(rebaseSteps, function(step) {
    var visNode = step.newCommit.get('visNode');

    newVisNodes.push(visNode);
    visNode.setOpacity(0);
    visNode.setOutgoingEdgesOpacity(0);
  }, this);

  var previousVisNodes = [];
  _.each(rebaseSteps, function(rebaseStep, index) {
    var toOmit = newVisNodes.slice(index + 1);

    var snapshotPart = this.genFromToSnapshotAnimation(
      rebaseStep.beforeSnapshot,
      rebaseStep.afterSnapshot,
      toOmit,
      previousVisNodes,
      gitVisuals
    );
    var birthPart = this.genCommitBirthClosureFromSnapshot(rebaseStep, gitVisuals);

    var animation = function() {
      snapshotPart();
      birthPart();
    };

    animationQueue.add(new Animation({
      closure: animation,
      duration: GRAPHICS.defaultAnimationTime * 1.5
    }));

    previousVisNodes.push(rebaseStep.newCommit.get('visNode'));
  }, this);

  // need to delay to let bouncing finish
  this.delay(animationQueue);

  this.refreshTree(animationQueue, gitVisuals);
};

AnimationFactory.prototype.delay = function(animationQueue, time) {
  time = time || GRAPHICS.defaultAnimationTime;
  animationQueue.add(new Animation({
    closure: function() { },
    duration: time
  }));
};

AnimationFactory.prototype.genSetAllCommitOpacities = function(visNodes, opacity) {
  // need to slice for closure
  var nodesToAnimate = visNodes.slice(0);

  return function() {
    _.each(nodesToAnimate, function(visNode) {
      visNode.setOpacity(opacity);
      visNode.setOutgoingEdgesOpacity(opacity);
    });
  };
};

AnimationFactory.prototype.stripObjectsFromSnapshot = function(snapShot, toOmit) {
  var ids = [];
  _.each(toOmit, function(obj) {
    ids.push(obj.getID());
  });

  var newSnapshot = {};
  _.each(snapShot, function(val, key) {
    if (_.include(ids, key)) {
      // omit
      return;
    }
    newSnapshot[key] = val;
  }, this);
  return newSnapshot;
};

AnimationFactory.prototype.genFromToSnapshotAnimation = function(
  beforeSnapshot,
  afterSnapshot,
  commitsToOmit,
  commitsToFixOpacity,
  gitVisuals) {

  // we want to omit the commit outgoing edges
  var toOmit = [];
  _.each(commitsToOmit, function(visNode) {
    toOmit.push(visNode);
    toOmit = toOmit.concat(visNode.get('outgoingEdges'));
  });

  var fixOpacity = function(obj) {
    if (!obj) { return; }
    _.each(obj, function(attr, partName) {
      obj[partName].opacity = 1;
    });
  };

  // HORRIBLE loop to fix opacities all throughout the snapshot
  _.each([beforeSnapshot, afterSnapshot], function(snapShot) {
    _.each(commitsToFixOpacity, function(visNode) {
      fixOpacity(snapShot[visNode.getID()]);
      _.each(visNode.get('outgoingEdges'), function(visEdge) {
        fixOpacity(snapShot[visEdge.getID()]);
      });
    });
  });

  return function() {
    gitVisuals.animateAllFromAttrToAttr(beforeSnapshot, afterSnapshot, toOmit);
  };
};

exports.AnimationFactory = AnimationFactory;


});
require("/src/js/visuals/animation/animationFactory.js");

require.define("/src/js/visuals/animation/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GLOBAL = require('../../util/constants').GLOBAL;

var Animation = Backbone.Model.extend({
  defaults: {
    duration: 300,
    closure: null
  },

  validateAtInit: function() {
    if (!this.get('closure')) {
      throw new Error('give me a closure!');
    }
  },

  initialize: function(options) {
    this.validateAtInit();
  },

  run: function() {
    this.get('closure')();
  }
});

var AnimationQueue = Backbone.Model.extend({
  defaults: {
    animations: null,
    index: 0,
    callback: null,
    defer: false
  },

  initialize: function(options) {
    this.set('animations', []);
    if (!options.callback) {
      console.warn('no callback');
    }
  },

  add: function(animation) {
    if (!animation instanceof Animation) {
      throw new Error("Need animation not something else");
    }

    this.get('animations').push(animation);
  },

  start: function() {
    this.set('index', 0);

    // set the global lock that we are animating
    GLOBAL.isAnimating = true;
    this.next();
  },

  finish: function() {
    // release lock here
    GLOBAL.isAnimating = false;
    this.get('callback')();
  },

  next: function() {
    // ok so call the first animation, and then set a timeout to call the next.
    // since an animation is defined as taking a specific amount of time,
    // we can simply just use timeouts rather than promises / deferreds.
    // for graphical displays that require an unknown amount of time, use deferreds
    // but not animation queue (see the finishAnimation for that)
    var animations = this.get('animations');
    var index = this.get('index');
    if (index >= animations.length) {
      this.finish();
      return;
    }

    var next = animations[index];
    var duration = next.get('duration');

    next.run();

    this.set('index', index + 1);
    setTimeout(_.bind(function() {
      this.next();
    }, this), duration);
  }
});

exports.Animation = Animation;
exports.AnimationQueue = AnimationQueue;

});
require("/src/js/visuals/animation/index.js");

require.define("/src/js/visuals/index.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Q = require('q');
var Backbone = require('backbone');

var GRAPHICS = require('../util/constants').GRAPHICS;
var GLOBAL = require('../util/constants').GLOBAL;

var Collections = require('../models/collections');
var CommitCollection = Collections.CommitCollection;
var BranchCollection = Collections.BranchCollection;

var VisNode = require('../visuals/visNode').VisNode;
var VisBranch = require('../visuals/visBranch').VisBranch;
var VisBranchCollection = require('../visuals/visBranch').VisBranchCollection;
var VisEdge = require('../visuals/visEdge').VisEdge;
var VisEdgeCollection = require('../visuals/visEdge').VisEdgeCollection;

function GitVisuals(options) {
  options = options || {};
  this.options = options;
  this.commitCollection = options.commitCollection;
  this.branchCollection = options.branchCollection;
  this.visNodeMap = {};

  this.visEdgeCollection = new VisEdgeCollection();
  this.visBranchCollection = new VisBranchCollection();
  this.commitMap = {};

  this.rootCommit = null;
  this.branchStackMap = null;
  this.upstreamBranchSet = null;
  this.upstreamHeadSet = null;

  this.paper = options.paper;
  this.gitReady = false;

  this.branchCollection.on('add', this.addBranchFromEvent, this);
  this.branchCollection.on('remove', this.removeBranch, this);
  this.deferred = [];

  // eventually have origin support here
  this.posBoundaries = {
    min: 0,
    max: 1
  };

  var Main = require('../app');
  Main.getEvents().on('refreshTree', this.refreshTree, this);
}

GitVisuals.prototype.defer = function(action) {
  this.deferred.push(action);
};

GitVisuals.prototype.deferFlush = function() {
  _.each(this.deferred, function(action) {
    action();
  }, this);
  this.deferred = [];
};

GitVisuals.prototype.resetAll = function() {
  // make sure to copy these collections because we remove
  // items in place and underscore is too dumb to detect length change
  var edges = this.visEdgeCollection.toArray();
  _.each(edges, function(visEdge) {
    visEdge.remove();
  }, this);

  var branches = this.visBranchCollection.toArray();
  _.each(branches, function(visBranch) {
    visBranch.remove();
  }, this);

  _.each(this.visNodeMap, function(visNode) {
    visNode.remove();
  }, this);

  this.visEdgeCollection.reset();
  this.visBranchCollection.reset();

  this.visNodeMap = {};
  this.rootCommit = null;
  this.commitMap = {};
};

GitVisuals.prototype.tearDown = function() {
  this.resetAll();
  this.paper.remove();
};

GitVisuals.prototype.assignGitEngine = function(gitEngine) {
  this.gitEngine = gitEngine;
  this.initHeadBranch();
  this.deferFlush();
};

GitVisuals.prototype.initHeadBranch = function() {
  // it's unfortaunte we have to do this, but the head branch
  // is an edge case because it's not part of a collection so
  // we can't use events to load or unload it. thus we have to call
  // this ugly method which will be deleted one day

  // seed this with the HEAD pseudo-branch
  this.addBranchFromEvent(this.gitEngine.HEAD);
};

GitVisuals.prototype.getScreenPadding = function() {
  // for now we return the node radius subtracted from the walls
  return {
    widthPadding: GRAPHICS.nodeRadius * 1.5,
    heightPadding: GRAPHICS.nodeRadius * 1.5
  };
};

GitVisuals.prototype.toScreenCoords = function(pos) {
  if (!this.paper.width) {
    throw new Error('being called too early for screen coords');
  }
  var padding = this.getScreenPadding();

  var shrink = function(frac, total, padding) {
    return padding + frac * (total - padding * 2);
  };

  return {
    x: shrink(pos.x, this.paper.width, padding.widthPadding),
    y: shrink(pos.y, this.paper.height, padding.heightPadding)
  };
};

GitVisuals.prototype.animateAllAttrKeys = function(keys, attr, speed, easing) {
  var deferred = Q.defer();

  var animate = function(visObj) {
    visObj.animateAttrKeys(keys, attr, speed, easing);
  };

  this.visBranchCollection.each(animate);
  this.visEdgeCollection.each(animate);
  _.each(this.visNodeMap, animate);

  var time = (speed !== undefined) ? speed : GRAPHICS.defaultAnimationTime;
  setTimeout(function() {
    deferred.resolve();
  }, time);

  return deferred.promise;
};

GitVisuals.prototype.finishAnimation = function() {
  var _this = this;
  var deferred = Q.defer();
  var animationDone = Q.defer();
  var defaultTime = GRAPHICS.defaultAnimationTime;
  var nodeRadius = GRAPHICS.nodeRadius;

  var textString = 'Solved!!\n:D';
  var text = null;
  var makeText = _.bind(function() {
    text = this.paper.text(
      this.paper.width / 2,
      this.paper.height / 2,
      textString
    );
    text.attr({
      opacity: 0,
      'font-weight': 500,
      'font-size': '32pt',
      'font-family': 'Monaco, Courier, font-monospace',
      stroke: '#000',
      'stroke-width': 2,
      fill: '#000'
    });
    text.animate({ opacity: 1 }, defaultTime);
  }, this);

  // this is a BIG ANIMATION but it ends up just being
  // a sweet chain of promises but is pretty nice. this is
  // after I discovered promises / deferred's. Unfortunately
  // I wrote a lot of the git stuff before promises, so
  // that's somewhat ugly

  deferred.promise
  // first fade out everything but circles
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['circle'] },
      { opacity: 0 },
      defaultTime * 1.1
    );
  }, this))
  // then make circle radii bigger
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['arrow', 'rect', 'path', 'text'] },
      { r: nodeRadius * 2 },
      defaultTime * 1.5
    );
  }, this))
  // then shrink em super fast
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['arrow', 'rect', 'path', 'text'] },
      { r: nodeRadius * 0.75 },
      defaultTime * 0.5
    );
  }, this))
  // then explode them and display text
  .then(_.bind(function() {
    makeText();
    return this.explodeNodes();
  }, this))
  .then(_.bind(function() {
    return this.explodeNodes();
  }, this))
  // then fade circles (aka everything) in and back
  .then(_.bind(function() {
    return this.animateAllAttrKeys(
      { exclude: ['arrow', 'rect', 'path', 'text'] },
      {},
      defaultTime * 1.25
    );
  }, this))
  // then fade everything in and remove text
  .then(_.bind(function() {
    text.animate({ opacity: 0 }, defaultTime, undefined, undefined, function() {
      text.remove();
    });
    return this.animateAllAttrKeys(
      {},
      {}
    );
  }, this))
  .then(function() {
    animationDone.resolve();
  })
  .fail(function(reason) {
    console.warn('animation error' + reason);
  })
  .done();

  // start our animation chain right away
  deferred.resolve();
  return animationDone.promise;
};

GitVisuals.prototype.explodeNodes = function() {
  var deferred = Q.defer();
  var funcs = [];
  _.each(this.visNodeMap, function(visNode) {
    funcs.push(visNode.getExplodeStepFunc());
  });

  var interval = setInterval(function() {
    // object creation here is a bit ugly inside a loop,
    // but the alternative is to just OR against a bunch
    // of booleans which means the other stepFuncs
    // are called unnecessarily when they have almost
    // zero speed. would be interesting to see performance differences
    var keepGoing = [];
    _.each(funcs, function(func) {
      if (func()) {
        keepGoing.push(func);
      }
    });

    if (!keepGoing.length) {
      clearInterval(interval);
      // next step :D wow I love promises
      deferred.resolve();
      return;
    }

    funcs = keepGoing;
  }, 1/40);

  return deferred.promise;
};

GitVisuals.prototype.animateAllFromAttrToAttr = function(fromSnapshot, toSnapshot, idsToOmit) {
  var animate = function(obj) {
    var id = obj.getID();
    if (_.include(idsToOmit, id)) {
      return;
    }

    if (!fromSnapshot[id] || !toSnapshot[id]) {
      // its actually ok it doesnt exist yet
      return;
    }
    obj.animateFromAttrToAttr(fromSnapshot[id], toSnapshot[id]);
  };

  this.visBranchCollection.each(animate);
  this.visEdgeCollection.each(animate);
  _.each(this.visNodeMap, animate);
};

/***************************************
     == BEGIN Tree Calculation Parts ==
       _  __    __  _
       \\/ /    \ \//_
        \ \     /   __|   __
         \ \___/   /_____/ /
          |        _______ \
          \  ( )   /      \_\
           \      /
            |    |
            |    |
  ____+-_=+-^    ^+-=_=__________

^^ I drew that :D

 **************************************/

GitVisuals.prototype.genSnapshot = function() {
  this.fullCalc();

  var snapshot = {};
  _.each(this.visNodeMap, function(visNode) {
    snapshot[visNode.get('id')] = visNode.getAttributes();
  }, this);

  this.visBranchCollection.each(function(visBranch) {
    snapshot[visBranch.getID()] = visBranch.getAttributes();
  }, this);

  this.visEdgeCollection.each(function(visEdge) {
    snapshot[visEdge.getID()] = visEdge.getAttributes();
  }, this);

  return snapshot;
};

GitVisuals.prototype.refreshTree = function(speed) {
  if (!this.gitReady || !this.gitEngine.rootCommit) {
    return;
  }

  // this method can only be called after graphics are rendered
  this.fullCalc();

  this.animateAll(speed);
};

GitVisuals.prototype.refreshTreeHarsh = function() {
  this.fullCalc();

  this.animateAll(0);
};

GitVisuals.prototype.animateAll = function(speed) {
  this.zIndexReflow();

  this.animateEdges(speed);
  this.animateNodePositions(speed);
  this.animateRefs(speed);
};

GitVisuals.prototype.fullCalc = function() {
  this.calcTreeCoords();
  this.calcGraphicsCoords();
};

GitVisuals.prototype.calcTreeCoords = function() {
  // this method can only contain things that dont rely on graphics
  if (!this.rootCommit) {
    throw new Error('grr, no root commit!');
  }

  this.calcUpstreamSets();
  this.calcBranchStacks();

  this.calcDepth();
  this.calcWidth();
};

GitVisuals.prototype.calcGraphicsCoords = function() {
  this.visBranchCollection.each(function(visBranch) {
    visBranch.updateName();
  });
};

GitVisuals.prototype.calcUpstreamSets = function() {
  this.upstreamBranchSet = this.gitEngine.getUpstreamBranchSet();
  this.upstreamHeadSet = this.gitEngine.getUpstreamHeadSet();
};

GitVisuals.prototype.getCommitUpstreamBranches = function(commit) {
  return this.branchStackMap[commit.get('id')];
};

GitVisuals.prototype.getBlendedHuesForCommit = function(commit) {
  var branches = this.upstreamBranchSet[commit.get('id')];
  if (!branches) {
    throw new Error('that commit doesnt have upstream branches!');
  }

  return this.blendHuesFromBranchStack(branches);
};

GitVisuals.prototype.blendHuesFromBranchStack = function(branchStackArray) {
  var hueStrings = [];
  _.each(branchStackArray, function(branchWrapper) {
    var fill = branchWrapper.obj.get('visBranch').get('fill');

    if (fill.slice(0,3) !== 'hsb') {
      // crap! convert
      var color = Raphael.color(fill);
      fill = 'hsb(' + String(color.h) + ',' + String(color.l);
      fill = fill + ',' + String(color.s) + ')';
    }

    hueStrings.push(fill);
  });

  return blendHueStrings(hueStrings);
};

GitVisuals.prototype.getCommitUpstreamStatus = function(commit) {
  if (!this.upstreamBranchSet) {
    throw new Error("Can't calculate this yet!");
  }

  var id = commit.get('id');
  var branch = this.upstreamBranchSet;
  var head = this.upstreamHeadSet;

  if (branch[id]) {
    return 'branch';
  } else if (head[id]) {
    return 'head';
  } else {
    return 'none';
  }
};

GitVisuals.prototype.calcBranchStacks = function() {
  var branches = this.gitEngine.getBranches();
  var map = {};
  _.each(branches, function(branch) {
    var thisId = branch.target.get('id');

    map[thisId] = map[thisId] || [];
    map[thisId].push(branch);
    map[thisId].sort(function(a, b) {
      var aId = a.obj.get('id');
      var bId = b.obj.get('id');
      if (aId == 'master' || bId == 'master') {
        return aId == 'master' ? -1 : 1;
      }
      return aId.localeCompare(bId);
    });
  });
  this.branchStackMap = map;
};

GitVisuals.prototype.calcWidth = function() {
  this.maxWidthRecursive(this.rootCommit);

  this.assignBoundsRecursive(
    this.rootCommit,
    this.posBoundaries.min,
    this.posBoundaries.max
  );
};

GitVisuals.prototype.maxWidthRecursive = function(commit) {
  var childrenTotalWidth = 0;
  _.each(commit.get('children'), function(child) {
    // only include this if we are the "main" parent of
    // this child
    if (child.isMainParent(commit)) {
      var childWidth = this.maxWidthRecursive(child);
      childrenTotalWidth += childWidth;
    }
  }, this);

  var maxWidth = Math.max(1, childrenTotalWidth);
  commit.get('visNode').set('maxWidth', maxWidth);
  return maxWidth;
};

GitVisuals.prototype.assignBoundsRecursive = function(commit, min, max) {
  // I always center myself within my bounds
  var myWidthPos = (min + max) / 2.0;
  commit.get('visNode').get('pos').x = myWidthPos;

  if (commit.get('children').length === 0) {
    return;
  }

  // i have a certain length to divide up
  var myLength = max - min;
  // I will divide up that length based on my children's max width in a
  // basic box-flex model
  var totalFlex = 0;
  var children = commit.get('children');
  _.each(children, function(child) {
    if (child.isMainParent(commit)) {
      totalFlex += child.get('visNode').getMaxWidthScaled();
    }
  }, this);

  var prevBound = min;

  // now go through and do everything
  // TODO: order so the max width children are in the middle!!
  _.each(children, function(child) {
    if (!child.isMainParent(commit)) {
      return;
    }

    var flex = child.get('visNode').getMaxWidthScaled();
    var portion = (flex / totalFlex) * myLength;
    var childMin = prevBound;
    var childMax = childMin + portion;
    this.assignBoundsRecursive(child, childMin, childMax);
    prevBound = childMax;
  }, this);
};

GitVisuals.prototype.calcDepth = function() {
  var maxDepth = this.calcDepthRecursive(this.rootCommit, 0);
  if (maxDepth > 15) {
    // issue warning
    console.warn('graphics are degrading from too many layers');
  }

  var depthIncrement = this.getDepthIncrement(maxDepth);
  _.each(this.visNodeMap, function(visNode) {
    visNode.setDepthBasedOn(depthIncrement);
  }, this);
};

/***************************************
     == END Tree Calculation ==
       _  __    __  _
       \\/ /    \ \//_
        \ \     /   __|   __
         \ \___/   /_____/ /
          |        _______ \
          \  ( )   /      \_\
           \      /
            |    |
            |    |
  ____+-_=+-^    ^+-=_=__________

^^ I drew that :D

 **************************************/

GitVisuals.prototype.animateNodePositions = function(speed) {
  _.each(this.visNodeMap, function(visNode) {
    visNode.animateUpdatedPosition(speed);
  }, this);
};

GitVisuals.prototype.addBranchFromEvent = function(branch, collection, index) {
  var action = _.bind(function() {
    this.addBranch(branch);
  }, this);

  if (!this.gitEngine || !this.gitReady) {
    this.defer(action);
  } else {
    action();
  }
};

GitVisuals.prototype.addBranch = function(branch) {
  var visBranch = new VisBranch({
    branch: branch,
    gitVisuals: this,
    gitEngine: this.gitEngine
  });

  this.visBranchCollection.add(visBranch);
  if (this.gitReady) {
    visBranch.genGraphics(this.paper);
  } else {
    this.defer(_.bind(function() {
      visBranch.genGraphics(this.paper);
    }, this));
  }
};

GitVisuals.prototype.removeVisBranch = function(visBranch) {
  this.visBranchCollection.remove(visBranch);
};

GitVisuals.prototype.removeVisNode = function(visNode) {
  this.visNodeMap[visNode.getID()] = undefined;
};

GitVisuals.prototype.removeVisEdge = function(visEdge) {
  this.visEdgeCollection.remove(visEdge);
};

GitVisuals.prototype.animateRefs = function(speed) {
  this.visBranchCollection.each(function(visBranch) {
    visBranch.animateUpdatedPos(speed);
  }, this);
};

GitVisuals.prototype.animateEdges = function(speed) {
  this.visEdgeCollection.each(function(edge) {
    edge.animateUpdatedPath(speed);
  }, this);
};

GitVisuals.prototype.getMinLayers = function() {
  return (this.options.smallCanvas) ? 4 : 7;
};

GitVisuals.prototype.getDepthIncrement = function(maxDepth) {
  // assume there are at least a number of layers until later
  // to have better visuals
  maxDepth = Math.max(maxDepth, this.getMinLayers());
  var increment = 1.0 / maxDepth;
  return increment;
};

GitVisuals.prototype.calcDepthRecursive = function(commit, depth) {
  commit.get('visNode').setDepth(depth);

  var children = commit.get('children');
  var maxDepth = depth;
  _.each(children, function(child) {
    var d = this.calcDepthRecursive(child, depth + 1);
    maxDepth = Math.max(d, maxDepth);
  }, this);

  return maxDepth;
};

// we debounce here so we aren't firing a resize call on every resize event
// but only after they stop
GitVisuals.prototype.canvasResize = function(width, height) {
  if (!this.resizeFunc) {
    this.genResizeFunc();
  }
  this.resizeFunc(width, height);
};

GitVisuals.prototype.genResizeFunc = function() {
  this.resizeFunc = _.debounce(
    _.bind(function(width, height) {

      // refresh when we are ready if we are animating som ething
      if (GLOBAL.isAnimating) {
        var Main = require('../app');
        Main.getEventBaton().trigger('commandSubmitted', 'refresh');
      } else {
        this.refreshTree();
      }
    }, this),
    200,
    true
  );
};

GitVisuals.prototype.addNode = function(id, commit) {
  this.commitMap[id] = commit;
  if (commit.get('rootCommit')) {
    this.rootCommit = commit;
  }

  var visNode = new VisNode({
    id: id,
    commit: commit,
    gitVisuals: this,
    gitEngine: this.gitEngine
  });
  this.visNodeMap[id] = visNode;

  if (this.gitReady) {
    visNode.genGraphics(this.paper);
  }
  return visNode;
};

GitVisuals.prototype.addEdge = function(idTail, idHead) {
  var visNodeTail = this.visNodeMap[idTail];
  var visNodeHead = this.visNodeMap[idHead];

  if (!visNodeTail || !visNodeHead) {
    throw new Error('one of the ids in (' + idTail +
                    ', ' + idHead + ') does not exist');
  }

  var edge = new VisEdge({
    tail: visNodeTail,
    head: visNodeHead,
    gitVisuals: this,
    gitEngine: this.gitEngine
  });
  this.visEdgeCollection.add(edge);

  if (this.gitReady) {
    edge.genGraphics(this.paper);
  }
};

GitVisuals.prototype.zIndexReflow = function() {
  this.visNodesFront();
  this.visBranchesFront();
};

GitVisuals.prototype.visNodesFront = function() {
  _.each(this.visNodeMap, function(visNode) {
    visNode.toFront();
  });
};

GitVisuals.prototype.visBranchesFront = function() {
  this.visBranchCollection.each(function(vBranch) {
    vBranch.nonTextToFront();
    vBranch.textToFront();
  });

  this.visBranchCollection.each(function(vBranch) {
    vBranch.textToFrontIfInStack();
  });
};

GitVisuals.prototype.drawTreeFromReload = function() {
  this.gitReady = true;
  // gen all the graphics we need
  this.deferFlush();

  this.calcTreeCoords();
};

GitVisuals.prototype.drawTreeFirstTime = function() {
  this.gitReady = true;
  this.calcTreeCoords();

  _.each(this.visNodeMap, function(visNode) {
    visNode.genGraphics(this.paper);
  }, this);

  this.visEdgeCollection.each(function(edge) {
    edge.genGraphics(this.paper);
  }, this);

  this.visBranchCollection.each(function(visBranch) {
    visBranch.genGraphics(this.paper);
  }, this);

  this.zIndexReflow();
};


/************************
 * Random util functions, some from liquidGraph
 ***********************/
function blendHueStrings(hueStrings) {
  // assumes a sat of 0.7 and brightness of 1

  var x = 0;
  var y = 0;
  var totalSat = 0;
  var totalBright = 0;
  var length = hueStrings.length;

  _.each(hueStrings, function(hueString) {
    var exploded = hueString.split('(')[1];
    exploded = exploded.split(')')[0];
    exploded = exploded.split(',');

    totalSat += parseFloat(exploded[1]);
    totalBright += parseFloat(exploded[2]);
    var hue = parseFloat(exploded[0]);

    var angle = hue * Math.PI * 2;
    x += Math.cos(angle);
    y += Math.sin(angle);
  });

  x = x / length;
  y = y / length;
  totalSat = totalSat / length;
  totalBright = totalBright / length;

  var hue = Math.atan2(y, x) / (Math.PI * 2); // could fail on 0's
  if (hue < 0) {
    hue = hue + 1;
  }
  return 'hsb(' + String(hue) + ',' + String(totalSat) + ',' + String(totalBright) + ')';
}

exports.GitVisuals = GitVisuals;


});
require("/src/js/visuals/index.js");

require.define("/src/js/visuals/tree.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var VisBase = Backbone.Model.extend({
  removeKeys: function(keys) {
    _.each(keys, function(key) {
      if (this.get(key)) {
        this.get(key).remove();
      }
    }, this);
  },

  animateAttrKeys: function(keys, attrObj, speed, easing) {
    // either we animate a specific subset of keys or all
    // possible things we could animate
    keys = _.extend(
      {},
      {
        include: ['circle', 'arrow', 'rect', 'path', 'text'],
        exclude: []
      },
      keys || {}
    );

    var attr = this.getAttributes();

    // safely insert this attribute into all the keys we want
    _.each(keys.include, function(key) {
      attr[key] = _.extend(
        {},
        attr[key],
        attrObj
      );
    });

    _.each(keys.exclude, function(key) {
      delete attr[key];
    });

    this.animateToAttr(attr, speed, easing);
  }
});

exports.VisBase = VisBase;


});
require("/src/js/visuals/tree.js");

require.define("/src/js/visuals/visBase.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');

var VisBase = Backbone.Model.extend({
  removeKeys: function(keys) {
    _.each(keys, function(key) {
      if (this.get(key)) {
        this.get(key).remove();
      }
    }, this);
  },

  animateAttrKeys: function(keys, attrObj, speed, easing) {
    // either we animate a specific subset of keys or all
    // possible things we could animate
    keys = _.extend(
      {},
      {
        include: ['circle', 'arrow', 'rect', 'path', 'text'],
        exclude: []
      },
      keys || {}
    );

    var attr = this.getAttributes();

    // safely insert this attribute into all the keys we want
    _.each(keys.include, function(key) {
      attr[key] = _.extend(
        {},
        attr[key],
        attrObj
      );
    });

    _.each(keys.exclude, function(key) {
      delete attr[key];
    });

    this.animateToAttr(attr, speed, easing);
  }
});

exports.VisBase = VisBase;


});
require("/src/js/visuals/visBase.js");

require.define("/src/js/visuals/visBranch.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GRAPHICS = require('../util/constants').GRAPHICS;

var VisBase = require('../visuals/visBase').VisBase;

var randomHueString = function() {
  var hue = Math.random();
  var str = 'hsb(' + String(hue) + ',0.7,1)';
  return str;
};

var VisBranch = VisBase.extend({
  defaults: {
    pos: null,
    text: null,
    rect: null,
    arrow: null,
    isHead: false,
    flip: 1,

    fill: GRAPHICS.rectFill,
    stroke: GRAPHICS.rectStroke,
    'stroke-width': GRAPHICS.rectStrokeWidth,

    offsetX: GRAPHICS.nodeRadius * 4.75,
    offsetY: 0,
    arrowHeight: 14,
    arrowInnerSkew: 0,
    arrowEdgeHeight: 6,
    arrowLength: 14,
    arrowOffsetFromCircleX: 10,

    vPad: 5,
    hPad: 5,

    animationSpeed: GRAPHICS.defaultAnimationTime,
    animationEasing: GRAPHICS.defaultEasing
  },

  validateAtInit: function() {
    if (!this.get('branch')) {
      throw new Error('need a branch!');
    }
  },

  getID: function() {
    return this.get('branch').get('id');
  },

  initialize: function() {
    this.validateAtInit();

    // shorthand notation for the main objects
    this.gitVisuals = this.get('gitVisuals');
    this.gitEngine = this.get('gitEngine');
    if (!this.gitEngine) {
      throw new Error('asd wtf');
    }

    this.get('branch').set('visBranch', this);
    var id = this.get('branch').get('id');

    if (id == 'HEAD') {
      // switch to a head ref
      this.set('isHead', true);
      this.set('flip', -1);

      this.set('fill', GRAPHICS.headRectFill);
    } else if (id !== 'master') {
      // we need to set our color to something random
      this.set('fill', randomHueString());
    }
  },

  getCommitPosition: function() {
    var commit = this.gitEngine.getCommitFromRef(this.get('branch'));
    var visNode = commit.get('visNode');

    var threshold = this.get('gitVisuals').posBoundaries.max;
    // somewhat tricky flip management here
    if (visNode.get('pos').x > threshold) {
      this.set('flip', -1);
    } else {
      this.set('flip', 1);
    }
    return visNode.getScreenCoords();
  },

  getBranchStackIndex: function() {
    if (this.get('isHead')) {
      // head is never stacked with other branches
      return 0;
    }

    var myArray = this.getBranchStackArray();
    var index = -1;
    _.each(myArray, function(branch, i) {
      if (branch.obj == this.get('branch')) {
        index = i;
      }
    }, this);
    return index;
  },

  getBranchStackLength: function() {
    if (this.get('isHead')) {
      // head is always by itself
      return 1;
    }

    return this.getBranchStackArray().length;
  },

  getBranchStackArray: function() {
    var arr = this.gitVisuals.branchStackMap[this.get('branch').get('target').get('id')];
    if (arr === undefined) {
      // this only occurs when we are generating graphics inside of
      // a new Branch instantiation, so we need to force the update
      this.gitVisuals.calcBranchStacks();
      return this.getBranchStackArray();
    }
    return arr;
  },

  getTextPosition: function() {
    var pos = this.getCommitPosition();

    // then order yourself accordingly. we use alphabetical sorting
    // so everything is independent
    var myPos = this.getBranchStackIndex();
    return {
      x: pos.x + this.get('flip') * this.get('offsetX'),
      y: pos.y + myPos * GRAPHICS.multiBranchY + this.get('offsetY')
    };
  },

  getRectPosition: function() {
    var pos = this.getTextPosition();
    var f = this.get('flip');

    // first get text width and height
    var textSize = this.getTextSize();
    return {
      x: pos.x - 0.5 * textSize.w - this.get('hPad'),
      y: pos.y - 0.5 * textSize.h - this.get('vPad')
    };
  },

  getArrowPath: function() {
    // should make these util functions...
    var offset2d = function(pos, x, y) {
      return {
        x: pos.x + x,
        y: pos.y + y
      };
    };
    var toStringCoords = function(pos) {
      return String(Math.round(pos.x)) + ',' + String(Math.round(pos.y));
    };
    var f = this.get('flip');

    var arrowTip = offset2d(this.getCommitPosition(),
      f * this.get('arrowOffsetFromCircleX'),
      0
    );
    var arrowEdgeUp = offset2d(arrowTip, f * this.get('arrowLength'), -this.get('arrowHeight'));
    var arrowEdgeLow = offset2d(arrowTip, f * this.get('arrowLength'), this.get('arrowHeight'));

    var arrowInnerUp = offset2d(arrowEdgeUp,
      f * this.get('arrowInnerSkew'),
      this.get('arrowEdgeHeight')
    );
    var arrowInnerLow = offset2d(arrowEdgeLow,
      f * this.get('arrowInnerSkew'),
      -this.get('arrowEdgeHeight')
    );

    var tailLength = 49;
    var arrowStartUp = offset2d(arrowInnerUp, f * tailLength, 0);
    var arrowStartLow = offset2d(arrowInnerLow, f * tailLength, 0);

    var pathStr = '';
    pathStr += 'M' + toStringCoords(arrowStartUp) + ' ';
    var coords = [
      arrowInnerUp,
      arrowEdgeUp,
      arrowTip,
      arrowEdgeLow,
      arrowInnerLow,
      arrowStartLow
    ];
    _.each(coords, function(pos) {
      pathStr += 'L' + toStringCoords(pos) + ' ';
    }, this);
    pathStr += 'z';
    return pathStr;
  },

  getTextSize: function() {
    var getTextWidth = function(visBranch) {
      var textNode = (visBranch.get('text')) ? visBranch.get('text').node : null;
      return (textNode === null) ? 0 : textNode.clientWidth;
    };

    var firefoxFix = function(obj) {
      if (!obj.w) { obj.w = 75; }
      if (!obj.h) { obj.h = 20; }
      return obj;
    };

    var textNode = this.get('text').node;
    if (this.get('isHead')) {
      // HEAD is a special case
      return firefoxFix({
        w: textNode.clientWidth,
        h: textNode.clientHeight
      });
    }

    var maxWidth = 0;
    _.each(this.getBranchStackArray(), function(branch) {
      maxWidth = Math.max(maxWidth, getTextWidth(
        branch.obj.get('visBranch')
      ));
    });

    return firefoxFix({
      w: maxWidth,
      h: textNode.clientHeight
    });
  },

  getSingleRectSize: function() {
    var textSize = this.getTextSize();
    var vPad = this.get('vPad');
    var hPad = this.get('hPad');
    return {
      w: textSize.w + vPad * 2,
      h: textSize.h + hPad * 2
    };
  },

  getRectSize: function() {
    var textSize = this.getTextSize();
    // enforce padding
    var vPad = this.get('vPad');
    var hPad = this.get('hPad');

    // number of other branch names we are housing
    var totalNum = this.getBranchStackLength();
    return {
      w: textSize.w + vPad * 2,
      h: textSize.h * totalNum * 1.1 + hPad * 2
    };
  },

  getName: function() {
    var name = this.get('branch').get('id');
    var selected = this.gitEngine.HEAD.get('target').get('id');

    var add = (selected == name) ? '*' : '';
    return name + add;
  },

  nonTextToFront: function() {
    this.get('arrow').toFront();
    this.get('rect').toFront();
  },

  textToFront: function() {
    this.get('text').toFront();
  },

  textToFrontIfInStack: function() {
    if (this.getBranchStackIndex() !== 0) {
      this.get('text').toFront();
    }
  },

  getFill: function() {
    // in the easy case, just return your own fill if you are:
    // - the HEAD ref
    // - by yourself (length of 1)
    // - part of a multi branch, but your thing is hidden
    if (this.get('isHead') ||
        this.getBranchStackLength() == 1 ||
        this.getBranchStackIndex() !== 0) {
      return this.get('fill');
    }

    // woof. now it's hard, we need to blend hues...
    return this.gitVisuals.blendHuesFromBranchStack(this.getBranchStackArray());
  },

  remove: function() {
    this.removeKeys(['text', 'arrow', 'rect']);
    // also need to remove from this.gitVisuals
    this.gitVisuals.removeVisBranch(this);
  },

  genGraphics: function(paper) {
    var textPos = this.getTextPosition();
    var name = this.getName();
    var text;

    // when from a reload, we dont need to generate the text
    text = paper.text(textPos.x, textPos.y, String(name));
    text.attr({
      'font-size': 14,
      'font-family': 'Monaco, Courier, font-monospace',
      opacity: this.getTextOpacity()
    });
    this.set('text', text);

    var rectPos = this.getRectPosition();
    var sizeOfRect = this.getRectSize();
    var rect = paper
      .rect(rectPos.x, rectPos.y, sizeOfRect.w, sizeOfRect.h, 8)
      .attr(this.getAttributes().rect);
    this.set('rect', rect);

    var arrowPath = this.getArrowPath();
    var arrow = paper
      .path(arrowPath)
      .attr(this.getAttributes().arrow);
    this.set('arrow', arrow);

    this.attachClickHandlers();
    rect.toFront();
    text.toFront();
  },

  attachClickHandlers: function() {
    if (this.get('gitVisuals').options.noClick) {
      return;
    }
    var commandStr = 'git checkout ' + this.get('branch').get('id');
    var Main = require('../app');
    var objs = [this.get('rect'), this.get('text'), this.get('arrow')];

    _.each(objs, function(rObj) {
      rObj.click(function() {
        Main.getEventBaton().trigger('commandSubmitted', commandStr);
      });
      $(rObj.node).css('cursor', 'pointer');
    });
  },

  updateName: function() {
    this.get('text').attr({
      text: this.getName()
    });
  },

  getNonTextOpacity: function() {
    if (this.get('isHead')) {
      return this.gitEngine.getDetachedHead() ? 1 : 0;
    }
    return this.getBranchStackIndex() === 0 ? 1 : 0.0;
  },

  getTextOpacity: function() {
    if (this.get('isHead')) {
      return this.gitEngine.getDetachedHead() ? 1 : 0;
    }
    return 1;
  },

  getAttributes: function() {
    var nonTextOpacity = this.getNonTextOpacity();
    var textOpacity = this.getTextOpacity();
    this.updateName();

    var textPos = this.getTextPosition();
    var rectPos = this.getRectPosition();
    var rectSize = this.getRectSize();

    var arrowPath = this.getArrowPath();

    return {
      text: {
        x: textPos.x,
        y: textPos.y,
        opacity: textOpacity
      },
      rect: {
        x: rectPos.x,
        y: rectPos.y,
        width: rectSize.w,
        height: rectSize.h,
        opacity: nonTextOpacity,
        fill: this.getFill(),
        stroke: this.get('stroke'),
        'stroke-width': this.get('stroke-width')
      },
      arrow: {
        path: arrowPath,
        opacity: nonTextOpacity,
        fill: this.getFill(),
        stroke: this.get('stroke'),
        'stroke-width': this.get('stroke-width')
      }
    };
  },

  animateUpdatedPos: function(speed, easing) {
    var attr = this.getAttributes();
    this.animateToAttr(attr, speed, easing);
  },

  animateFromAttrToAttr: function(fromAttr, toAttr, speed, easing) {
    // an animation of 0 is essentially setting the attribute directly
    this.animateToAttr(fromAttr, 0);
    this.animateToAttr(toAttr, speed, easing);
  },

  animateToAttr: function(attr, speed, easing) {
    if (speed === 0) {
      this.get('text').attr(attr.text);
      this.get('rect').attr(attr.rect);
      this.get('arrow').attr(attr.arrow);
      return;
    }

    var s = speed !== undefined ? speed : this.get('animationSpeed');
    var e = easing || this.get('animationEasing');

    this.get('text').stop().animate(attr.text, s, e);
    this.get('rect').stop().animate(attr.rect, s, e);
    this.get('arrow').stop().animate(attr.arrow, s, e);
  }
});

var VisBranchCollection = Backbone.Collection.extend({
  model: VisBranch
});

exports.VisBranchCollection = VisBranchCollection;
exports.VisBranch = VisBranch;
exports.randomHueString = randomHueString;


});
require("/src/js/visuals/visBranch.js");

require.define("/src/js/visuals/visEdge.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GRAPHICS = require('../util/constants').GRAPHICS;

var VisBase = require('../visuals/visBase').VisBase;

var VisEdge = VisBase.extend({
  defaults: {
    tail: null,
    head: null,
    animationSpeed: GRAPHICS.defaultAnimationTime,
    animationEasing: GRAPHICS.defaultEasing
  },

  validateAtInit: function() {
    var required = ['tail', 'head'];
    _.each(required, function(key) {
      if (!this.get(key)) {
        throw new Error(key + ' is required!');
      }
    }, this);
  },

  getID: function() {
    return this.get('tail').get('id') + '.' + this.get('head').get('id');
  },

  initialize: function() {
    this.validateAtInit();

    // shorthand for the main objects
    this.gitVisuals = this.get('gitVisuals');
    this.gitEngine = this.get('gitEngine');

    this.get('tail').get('outgoingEdges').push(this);
  },

  remove: function() {
    this.removeKeys(['path']);
    this.gitVisuals.removeVisEdge(this);
  },

  genSmoothBezierPathString: function(tail, head) {
    var tailPos = tail.getScreenCoords();
    var headPos = head.getScreenCoords();
    return this.genSmoothBezierPathStringFromCoords(tailPos, headPos);
  },

  genSmoothBezierPathStringFromCoords: function(tailPos, headPos) {
    // we need to generate the path and control points for the bezier. format
    // is M(move abs) C (curve to) (control point 1) (control point 2) (final point)
    // the control points have to be __below__ to get the curve starting off straight.

    var coords = function(pos) {
      return String(Math.round(pos.x)) + ',' + String(Math.round(pos.y));
    };
    var offset = function(pos, dir, delta) {
      delta = delta || GRAPHICS.curveControlPointOffset;
      return {
        x: pos.x,
        y: pos.y + delta * dir
      };
    };
    var offset2d = function(pos, x, y) {
      return {
        x: pos.x + x,
        y: pos.y + y
      };
    };

    // first offset tail and head by radii
    tailPos = offset(tailPos, -1, this.get('tail').getRadius());
    headPos = offset(headPos, 1, this.get('head').getRadius());

    var str = '';
    // first move to bottom of tail
    str += 'M' + coords(tailPos) + ' ';
    // start bezier
    str += 'C';
    // then control points above tail and below head
    str += coords(offset(tailPos, -1)) + ' ';
    str += coords(offset(headPos, 1)) + ' ';
    // now finish
    str += coords(headPos);

    // arrow head
    var delta = GRAPHICS.arrowHeadSize || 10;
    str += ' L' + coords(offset2d(headPos, -delta, delta));
    str += ' L' + coords(offset2d(headPos, delta, delta));
    str += ' L' + coords(headPos);

    // then go back, so we can fill correctly
    str += 'C';
    str += coords(offset(headPos, 1)) + ' ';
    str += coords(offset(tailPos, -1)) + ' ';
    str += coords(tailPos);

    return str;
  },

  getBezierCurve: function() {
    return this.genSmoothBezierPathString(this.get('tail'), this.get('head'));
  },

  getStrokeColor: function() {
    return GRAPHICS.visBranchStrokeColorNone;
  },

  setOpacity: function(opacity) {
    opacity = (opacity === undefined) ? 1 : opacity;

    this.get('path').attr({opacity: opacity});
  },

  genGraphics: function(paper) {
    var pathString = this.getBezierCurve();

    var path = paper.path(pathString).attr({
      'stroke-width': GRAPHICS.visBranchStrokeWidth,
      'stroke': this.getStrokeColor(),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'fill': this.getStrokeColor()
    });
    path.toBack();
    this.set('path', path);
  },

  getOpacity: function() {
    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('tail'));
    var map = {
      'branch': 1,
      'head': GRAPHICS.edgeUpstreamHeadOpacity,
      'none': GRAPHICS.edgeUpstreamNoneOpacity
    };

    if (map[stat] === undefined) { throw new Error('bad stat'); }
    return map[stat];
  },

  getAttributes: function() {
    var newPath = this.getBezierCurve();
    var opacity = this.getOpacity();
    return {
      path: {
        path: newPath,
        opacity: opacity
      }
    };
  },

  animateUpdatedPath: function(speed, easing) {
    var attr = this.getAttributes();
    this.animateToAttr(attr, speed, easing);
  },

  animateFromAttrToAttr: function(fromAttr, toAttr, speed, easing) {
    // an animation of 0 is essentially setting the attribute directly
    this.animateToAttr(fromAttr, 0);
    this.animateToAttr(toAttr, speed, easing);
  },

  animateToAttr: function(attr, speed, easing) {
    if (speed === 0) {
      this.get('path').attr(attr.path);
      return;
    }

    this.get('path').toBack();
    this.get('path').stop().animate(
      attr.path,
      speed !== undefined ? speed : this.get('animationSpeed'),
      easing || this.get('animationEasing')
    );
  }
});

var VisEdgeCollection = Backbone.Collection.extend({
  model: VisEdge
});

exports.VisEdgeCollection = VisEdgeCollection;
exports.VisEdge = VisEdge;

});
require("/src/js/visuals/visEdge.js");

require.define("/src/js/visuals/visNode.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var Backbone = require('backbone');
var GRAPHICS = require('../util/constants').GRAPHICS;

var VisBase = require('../visuals/visBase').VisBase;

var VisNode = VisBase.extend({
  defaults: {
    depth: undefined,
    maxWidth: null,
    outgoingEdges: null,

    circle: null,
    text: null,

    id: null,
    pos: null,
    radius: null,

    commit: null,
    animationSpeed: GRAPHICS.defaultAnimationTime,
    animationEasing: GRAPHICS.defaultEasing,

    fill: GRAPHICS.defaultNodeFill,
    'stroke-width': GRAPHICS.defaultNodeStrokeWidth,
    stroke: GRAPHICS.defaultNodeStroke
  },

  getID: function() {
    return this.get('id');
  },

  validateAtInit: function() {
    if (!this.get('id')) {
      throw new Error('need id for mapping');
    }
    if (!this.get('commit')) {
      throw new Error('need commit for linking');
    }

    if (!this.get('pos')) {
      this.set('pos', {
        x: Math.random(),
        y: Math.random()
      });
    }
  },

  initialize: function() {
    this.validateAtInit();
    // shorthand for the main objects
    this.gitVisuals = this.get('gitVisuals');
    this.gitEngine = this.get('gitEngine');

    this.set('outgoingEdges', []);
  },

  setDepth: function(depth) {
    // for merge commits we need to max the depths across all
    this.set('depth', Math.max(this.get('depth') || 0, depth));
  },

  setDepthBasedOn: function(depthIncrement) {
    if (this.get('depth') === undefined) {
      debugger;
      throw new Error('no depth yet!');
    }
    var pos = this.get('pos');
    pos.y = this.get('depth') * depthIncrement;
  },

  getMaxWidthScaled: function() {
    // returns our max width scaled based on if we are visible
    // from a branch or not
    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('commit'));
    var map = {
      branch: 1,
      head: 0.3,
      none: 0.1
    };
    if (map[stat] === undefined) { throw new Error('bad stat'); }
    return map[stat] * this.get('maxWidth');
  },

  toFront: function() {
    this.get('circle').toFront();
    this.get('text').toFront();
  },

  getOpacity: function() {
    var map = {
      'branch': 1,
      'head': GRAPHICS.upstreamHeadOpacity,
      'none': GRAPHICS.upstreamNoneOpacity
    };

    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('commit'));
    if (map[stat] === undefined) {
      throw new Error('invalid status');
    }
    return map[stat];
  },

  getTextScreenCoords: function() {
    return this.getScreenCoords();
  },

  getAttributes: function() {
    var pos = this.getScreenCoords();
    var textPos = this.getTextScreenCoords();
    var opacity = this.getOpacity();

    return {
      circle: {
        cx: pos.x,
        cy: pos.y,
        opacity: opacity,
        r: this.getRadius(),
        fill: this.getFill(),
        'stroke-width': this.get('stroke-width'),
        stroke: this.get('stroke')
      },
      text: {
        x: textPos.x,
        y: textPos.y,
        opacity: opacity
      }
    };
  },

  highlightTo: function(visObj, speed, easing) {
    // a small function to highlight the color of a node for demonstration purposes
    var color = visObj.get('fill');

    var attr = {
      circle: {
        fill: color,
        stroke: color,
        'stroke-width': this.get('stroke-width') * 5
      },
      text: {}
    };

    this.animateToAttr(attr, speed, easing);
  },

  animateUpdatedPosition: function(speed, easing) {
    var attr = this.getAttributes();
    this.animateToAttr(attr, speed, easing);
  },

  animateFromAttrToAttr: function(fromAttr, toAttr, speed, easing) {
    // an animation of 0 is essentially setting the attribute directly
    this.animateToAttr(fromAttr, 0);
    this.animateToAttr(toAttr, speed, easing);
  },

  animateToSnapshot: function(snapShot, speed, easing) {
    if (!snapShot[this.getID()]) {
      return;
    }
    this.animateToAttr(snapShot[this.getID()], speed, easing);
  },

  animateToAttr: function(attr, speed, easing) {
    if (speed === 0) {
      this.get('circle').attr(attr.circle);
      this.get('text').attr(attr.text);
      return;
    }

    var s = speed !== undefined ? speed : this.get('animationSpeed');
    var e = easing || this.get('animationEasing');

    this.get('circle').stop().animate(attr.circle, s, e);
    this.get('text').stop().animate(attr.text, s, e);

    if (easing == 'bounce' &&
        attr.circle && attr.circle.cx !== undefined &&
        attr.text && attr.text.x !== undefined ) {
      // animate the x attribute without bouncing so it looks like there's
      // gravity in only one direction. Just a small animation polish
      this.get('circle').animate(attr.circle.cx, s, 'easeInOut');
      this.get('text').animate(attr.text.x, s, 'easeInOut');
    }
  },

  getScreenCoords: function() {
    var pos = this.get('pos');
    return this.gitVisuals.toScreenCoords(pos);
  },

  getRadius: function() {
    return this.get('radius') || GRAPHICS.nodeRadius;
  },

  getParentScreenCoords: function() {
    return this.get('commit').get('parents')[0].get('visNode').getScreenCoords();
  },

  setBirthPosition: function() {
    // utility method for animating it out from underneath a parent
    var parentCoords = this.getParentScreenCoords();

    this.get('circle').attr({
      cx: parentCoords.x,
      cy: parentCoords.y,
      opacity: 0,
      r: 0
    });
    this.get('text').attr({
      x: parentCoords.x,
      y: parentCoords.y,
      opacity: 0
    });
  },

  setBirthFromSnapshot: function(beforeSnapshot) {
    // first get parent attribute
    // woof this is pretty bad data access...
    var parentID = this.get('commit').get('parents')[0].get('visNode').getID();
    var parentAttr = beforeSnapshot[parentID];

    // then set myself faded on top of parent
    this.get('circle').attr({
      opacity: 0,
      r: 0,
      cx: parentAttr.circle.cx,
      cy: parentAttr.circle.cy
    });

    this.get('text').attr({
      opacity: 0,
      x: parentAttr.text.x,
      y: parentAttr.text.y
    });

    // then do edges
    var parentCoords = {
      x: parentAttr.circle.cx,
      y: parentAttr.circle.cy
    };
    this.setOutgoingEdgesBirthPosition(parentCoords);
  },

  setBirth: function() {
    this.setBirthPosition();
    this.setOutgoingEdgesBirthPosition(this.getParentScreenCoords());
  },

  setOutgoingEdgesOpacity: function(opacity) {
    _.each(this.get('outgoingEdges'), function(edge) {
      edge.setOpacity(opacity);
    });
  },

  animateOutgoingEdgesToAttr: function(snapShot, speed, easing) {
    _.each(this.get('outgoingEdges'), function(edge) {
      var attr = snapShot[edge.getID()];
      edge.animateToAttr(attr);
    }, this);
  },

  animateOutgoingEdges: function(speed, easing) {
    _.each(this.get('outgoingEdges'), function(edge) {
      edge.animateUpdatedPath(speed, easing);
    }, this);
  },

  animateOutgoingEdgesFromSnapshot: function(snapshot, speed, easing) {
    _.each(this.get('outgoingEdges'), function(edge) {
      var attr = snapshot[edge.getID()];
      edge.animateToAttr(attr, speed, easing);
    }, this);
  },

  setOutgoingEdgesBirthPosition: function(parentCoords) {
    _.each(this.get('outgoingEdges'), function(edge) {
      var headPos = edge.get('head').getScreenCoords();
      var path = edge.genSmoothBezierPathStringFromCoords(parentCoords, headPos);
      edge.get('path').stop().attr({
        path: path,
        opacity: 0
      });
    }, this);
  },

  parentInFront: function() {
    // woof! talk about bad data access
    this.get('commit').get('parents')[0].get('visNode').toFront();
  },

  getFontSize: function(str) {
    if (str.length < 3) {
      return 12;
    } else if (str.length < 5) {
      return 10;
    } else {
      return 8;
    }
  },

  getFill: function() {
    // first get our status, might be easy from this
    var stat = this.gitVisuals.getCommitUpstreamStatus(this.get('commit'));
    if (stat == 'head') {
      return GRAPHICS.headRectFill;
    } else if (stat == 'none') {
      return GRAPHICS.orphanNodeFill;
    }

    // now we need to get branch hues
    return this.gitVisuals.getBlendedHuesForCommit(this.get('commit'));
  },

  attachClickHandlers: function() {
    if (this.get('gitVisuals').options.noClick) {
      return;
    }
    var commandStr = 'git checkout ' + this.get('commit').get('id');
    var Main = require('../app');
    _.each([this.get('circle'), this.get('text')], function(rObj) {
      rObj.click(function() {
        Main.getEventBaton().trigger('commandSubmitted', commandStr);
      });
      $(rObj.node).css('cursor', 'pointer');
    });
  },

  setOpacity: function(opacity) {
    opacity = (opacity === undefined) ? 1 : opacity;

    // set the opacity on my stuff
    var keys = ['circle', 'text'];
    _.each(keys, function(key) {
      this.get(key).attr({
        opacity: opacity
      });
    }, this);
  },

  remove: function() {
    this.removeKeys(['circle'], ['text']);
    // needs a manual removal of text for whatever reason
    var text = this.get('text');
    if (text) {
      text.remove();
    }

    this.gitVisuals.removeVisNode(this);
  },

  removeAll: function() {
    this.remove();
    _.each(this.get('outgoingEdges'), function(edge) {
      edge.remove();
    }, this);
  },

  getExplodeStepFunc: function() {
    var circle = this.get('circle');

    // decide on a speed
    var speedMag = 20;
    // aim upwards
    var angle = Math.PI + Math.random() * 1 * Math.PI;
    var gravity = 1 / 5;
    var drag = 1 / 100;

    var vx = speedMag * Math.cos(angle);
    var vy = speedMag * Math.sin(angle);
    var x = circle.attr('cx');
    var y = circle.attr('cy');

    var maxWidth = this.gitVisuals.paper.width;
    var maxHeight = this.gitVisuals.paper.height;
    var elasticity = 0.8;
    var dt = 1.0;

    var stepFunc = function() {
      // lol epic runge kutta here... not
      vy += gravity * dt - drag * vy;
      vx -= drag * vx;
      x += vx * dt;
      y += vy * dt;

      if (x < 0 || x > maxWidth) {
        vx = elasticity * -vx;
        x = (x < 0) ? 0 : maxWidth;
      }
      if (y < 0 || y > maxHeight) {
        vy = elasticity * -vy;
        y = (y < 0) ? 0 : maxHeight;
      }

      circle.attr({
        cx: x,
        cy: y
      });
      // continuation calculation
      if ((vx * vx + vy * vy) < 0.01 && Math.abs(y - maxHeight) === 0) {
        // dont need to animate anymore, we are on ground
        return false;
      }
      // keep animating!
      return true;
    };
    return stepFunc;
  },

  genGraphics: function() {
    var paper = this.gitVisuals.paper;

    var pos = this.getScreenCoords();
    var textPos = this.getTextScreenCoords();

    var circle = paper.circle(
      pos.x,
      pos.y,
      this.getRadius()
    ).attr(this.getAttributes().circle);

    var text = paper.text(textPos.x, textPos.y, String(this.get('id')));
    text.attr({
      'font-size': this.getFontSize(this.get('id')),
      'font-weight': 'bold',
      'font-family': 'Monaco, Courier, font-monospace',
      opacity: this.getOpacity()
    });

    this.set('circle', circle);
    this.set('text', text);

    this.attachClickHandlers();
  }
});

exports.VisNode = VisNode;

});
require("/src/js/visuals/visNode.js");

require.define("/src/js/visuals/visualization.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Collections = require('../models/collections');
var CommitCollection = Collections.CommitCollection;
var BranchCollection = Collections.BranchCollection;
var EventBaton = require('../util/eventBaton').EventBaton;

var GitVisuals = require('../visuals').GitVisuals;

var Visualization = Backbone.View.extend({
  initialize: function(options) {
    options = options || {};
    this.options = options;
    this.customEvents = _.clone(Backbone.Events);
    this.containerElement = options.containerElement;

    var _this = this;
    // we want to add our canvas somewhere
    var container = options.containerElement || $('#canvasHolder')[0];
    new Raphael(container, 200, 200, function() {
      // raphael calls with paper as this for some inane reason...
      var paper = this;
      // use process.nextTick to go from sync to async
      process.nextTick(function() {
        _this.paperInitialize(paper, options);
      });
    });
  },

  paperInitialize: function(paper, options) {
    this.treeString = options.treeString;
    this.paper = paper;

    var Main = require('../app');
    // if we dont want to receive keyoard input (directly),
    // make a new event baton so git engine steals something that no one
    // is broadcasting to
    this.eventBaton = (options.noKeyboardInput) ?
      new EventBaton():
      Main.getEventBaton();

    this.commitCollection = new CommitCollection();
    this.branchCollection = new BranchCollection();

    this.gitVisuals = new GitVisuals({
      commitCollection: this.commitCollection,
      branchCollection: this.branchCollection,
      paper: this.paper,
      noClick: this.options.noClick,
      smallCanvas: this.options.smallCanvas
    });

    var GitEngine = require('../git').GitEngine;
    this.gitEngine = new GitEngine({
      collection: this.commitCollection,
      branches: this.branchCollection,
      gitVisuals: this.gitVisuals,
      eventBaton: this.eventBaton
    });
    this.gitEngine.init();
    this.gitVisuals.assignGitEngine(this.gitEngine);

    this.myResize();

    $(window).on('resize', _.bind(function() {
      this.myResize();
    }, this));

    this.gitVisuals.drawTreeFirstTime();
    if (this.treeString) {
      this.gitEngine.loadTreeFromString(this.treeString);
    }
    if (this.options.zIndex) {
      this.setTreeIndex(this.options.zIndex);
    }

    this.shown = false;
    this.setTreeOpacity(0);
    // reflow needed
    process.nextTick(_.bind(this.fadeTreeIn, this));

    this.customEvents.trigger('gitEngineReady');
    this.customEvents.trigger('paperReady');
  },

  setTreeIndex: function(level) {
    $(this.paper.canvas).css('z-index', level);
  },

  setTreeOpacity: function(level) {
    if (level === 0) {
      this.shown = false;
    }

    $(this.paper.canvas).css('opacity', level);
  },

  getAnimationTime: function() { return 300; },

  fadeTreeIn: function() {
    this.shown = true;
    $(this.paper.canvas).animate({opacity: 1}, this.getAnimationTime());
  },

  fadeTreeOut: function() {
    this.shown = false;
    $(this.paper.canvas).animate({opacity: 0}, this.getAnimationTime());
  },

  hide: function() {
    this.fadeTreeOut();
    // remove click handlers by toggling visibility
    setTimeout(_.bind(function() {
      $(this.paper.canvas).css('visibility', 'hidden');
    }, this), this.getAnimationTime());
  },

  show: function() {
    $(this.paper.canvas).css('visibility', 'visible');
    setTimeout(_.bind(this.fadeTreeIn, this), 10);
  },

  showHarsh: function() {
    $(this.paper.canvas).css('visibility', 'visible');
    this.setTreeOpacity(1);
  },

  resetFromThisTreeNow: function(treeString) {
    this.treeString = treeString;
  },

  reset: function() {
    this.setTreeOpacity(0);
    if (this.treeString) {
      this.gitEngine.loadTreeFromString(this.treeString);
    } else {
      this.gitEngine.defaultInit();
    }
    this.fadeTreeIn();
  },

  tearDown: function() {
    this.gitEngine.tearDown();
    this.gitVisuals.tearDown();
    delete this.paper;
  },

  die: function() {
    this.fadeTreeOut();
    setTimeout(_.bind(function() {
      if (!this.shown) {
        this.tearDown();
      }
    }, this), this.getAnimationTime());
  },

  myResize: function() {
    if (!this.paper) { return; }

    var smaller = 1;
    var el = this.el;

    var width = el.clientWidth - smaller;
    var height = el.clientHeight - smaller;

    // if we don't have a container, we need to set our
    // position absolutely to whatever we are tracking
    if (!this.containerElement) {
      var left = el.offsetLeft;
      var top = el.offsetTop;

      $(this.paper.canvas).css({
        position: 'absolute',
        left: left + 'px',
        top: top + 'px'
      });
    }

    this.paper.setSize(width, height);
    this.gitVisuals.canvasResize(width, height);
  }
});

exports.Visualization = Visualization;


});
require("/src/js/visuals/visualization.js");

require.define("/src/levels/index.js",function(require,module,exports,__dirname,__filename,process,global){// Each level is part of a "sequence;" levels within
// a sequence proceed in the order listed here
exports.levelSequences = {
  intro: [
    require('../../levels/intro/1').level,
    require('../../levels/intro/2').level,
    require('../../levels/intro/3').level,
    require('../../levels/intro/4').level,
    require('../../levels/intro/5').level
  ],
  rebase: [
    require('../../levels/rebase/1').level,
    require('../../levels/rebase/2').level
  ],
  mixed: [
    require('../../levels/mixed/1').level,
    require('../../levels/mixed/2').level,
    require('../../levels/mixed/3').level
  ]
};

// there are also cute names and such for sequences
exports.sequenceInfo = {
  intro: {
    displayName: 'Introduction Sequence',
    about: 'A nicely paced introduction to the majority of git commands'
  },
  rebase: {
    displayName: 'Master the Rebase Luke!',
    about: 'What is this whole rebase hotness everyone is talking about? Find out!'
  },
  mixed: {
    displayName: 'A Mixed Bag',
    about: 'A mixed bag of Git techniques, tricks, and tips'
  }
};


});
require("/src/levels/index.js");

require.define("/src/levels/intro/1.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "name": 'Introduction to Git Commits',
  "goalTreeString": "{\"branches\":{\"master\":{\"target\":\"C3\",\"id\":\"master\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git commit;git commit",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "hint": "Just type in 'git commit' twice to finish!",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Git Commits",
            "",
            "A commit in git is a recorded set of changes that you have made -- for instance, it's the 10 lines you added for a new feature or a new image added to the assets folder.",
            "",
            "Because git commits are simply *delta*'s (or changes between states) rather than entire copies of the repository, they make Git's version control quite lightweight and efficient. The days of copying your entire codebase onto an external hard drive are over!",
            "",
            "The only tricky thing is that if you want to download an entire codebase, you have to download every single commit (essentially the history of the repository) and apply them all on top of each other to get the current version. This is why you might see the command line output:",
            "",
            "```",
            "Resolving Deltas...",
            "```",
            "",
            "When you clone a git repo. Git essentially replays the entire development history on your computer in a few seconds, leaving you (at the end) with the current version of the repository!"
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's see what this looks like in practice. On the right we have a visualization of a (small) git repository. There are two commits right now -- the first initial commit, `C0`, and one commit after that `C1` that might have some meaningful changes.",
            "",
            "Hit the button below to make a new commit"
          ],
          "afterMarkdowns": [
            "There we go! Awesome. We just made changes to the repository and saved them as a commit. The commit we just made has a parent, `C1`, which references which commit it was based off of."
          ],
          "command": "git commit",
          "beforeCommand": ""
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "Go ahead and try it out on your own! After this window closes, make two commits to complete the level"
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/intro/1.js");

require.define("/src/levels/intro/2.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"bugFix\":{\"target\":\"C1\",\"id\":\"bugFix\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"}},\"HEAD\":{\"target\":\"bugFix\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git branch bugFix;git checkout bugFix",
  "hint": "Make a new branch with \"git branch [name]\" and check it out with \"git checkout [name]\"",
  "name": "Branching in Git",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Git Branches",
            "",
            "Branches in Git are incredibly lightweight as well. They are simply references to a specific commit -- nothing more. This is why many Git enthusiasts chant the mantra:",
            "",
            "```",
            "branch early, and branch often",
            "```",
            "",
            "Because there is no storage / memory overhead with making many branches, it's easier to logically divide up your work than have big beefy branches.",
            "",
            "When we start mixing branches and commits, we will see how these two features combine. For now though, just remember that a branch essentially says \"I want to include the work of this commit and all parent commits.\""
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's see what branches look like in practice.",
            "",
            "Here we will check out a new branch named `newImage`"
          ],
          "afterMarkdowns": [
            "There, that's all there is to branching! The branch `newImage` now refers to commit `C1`"
          ],
          "command": "git branch newImage",
          "beforeCommand": ""
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's try to put some work on this new branch. Hit the button below"
          ],
          "afterMarkdowns": [
            "Oh no! The `master` branch moved but the `newImage` branch didn't! That's because we weren't \"on\" the new branch, which is why the asterisk (*) was on `master`"
          ],
          "command": "git commit",
          "beforeCommand": "git branch newImage"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's tell git we want to checkout the branch with",
            "",
            "```",
            "git checkout [name]",
            "```",
            "",
            "This will put us on the new branch before committing our changes"
          ],
          "afterMarkdowns": [
            "There we go! Our changes were recorded on the new branch"
          ],
          "command": "git checkout newImage; git commit",
          "beforeCommand": "git branch newImage"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "Ok! You are all ready to get branching. Once this window closes,",
            "make a new branch named `bugFix` and switch to that branch"
          ]
        }
      }
    ]
  }
};
});
require("/src/levels/intro/2.js");

require.define("/src/levels/intro/3.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "{\"branches\":{\"master\":{\"target\":\"C4\",\"id\":\"master\"},\"bugFix\":{\"target\":\"C2\",\"id\":\"bugFix\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C1\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C2\",\"C3\"],\"id\":\"C4\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git checkout -b bugFix;git commit;git checkout master;git commit;git merge bugFix",
  "name": "Merging in Git",
  "hint": "Remember to commit in the order specified (bugFix before master)",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Branches and Merging",
            "",
            "Great! We now know how to commit and branch. Now we need to learn some kind of way of combining the work from two different branches together. This will allow us to branch off, develop a new feature, and then combine it back in.",
            "",
            "The first method to combine work that we will examine is `git merge`. Merging in Git creates a special commit that has two unique parents. A commit with two parents essentially means \"I want to include all the work from this parent over here and this one over here, *and* the set of all their parents.\"",
            "",
            "It's easier with visuals, let's check it out in the next view"
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Here we have two branches; each has one commit that's unique. This means that neither branch includes the entire set of \"work\" in the repository that we have done. Let's fix that with merge.",
            "",
            "We will `merge` the branch `bugFix` into `master`"
          ],
          "afterMarkdowns": [
            "Woah! See that? First of all, `master` now points to a commit that has two parents. If you follow the arrows upstream from `master`, you will hit every commit along the way to the root. This means that `master` contains all the work in the repository now.",
            "",
            "Also, see how the colors of the commits changed? To help with learning, I have included some color coordination. Each branch has a unique color. Each commit turns a color that is the blended combination of all the branches that contain that commit.",
            "",
            "So here we see that the `master` branch color is blended into all the commits, but the `bugFix` color is not. Let's fix that..."
          ],
          "command": "git merge bugFix master",
          "beforeCommand": "git checkout -b bugFix; git commit; git checkout master; git commit"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Let's merge `master` into `bugFix`:"
          ],
          "afterMarkdowns": [
            "Since `bugFix` was downstream of `master`, git didn't have to do any work; it simply just moved `bugFix` to the same commit `master` was attached to.",
            "",
            "Now all the commits are the same color, which means each branch contains all the work in the repository! Woohoo"
          ],
          "command": "git merge master bugFix",
          "beforeCommand": "git checkout -b bugFix; git commit; git checkout master; git commit; git merge bugFix master"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "To complete this level, do the following steps:",
            "",
            "* Make a new branch called `bugFix`",
            "* Commit once",
            "* Go back to `master` with `git checkout`",
            "* Commit another time",
            "* Merge the branch `bugFix` into `master` with `git merge`",
            "",
            "*Remember, you can always re-display this dialog with \"help level\"!*"
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/intro/3.js");

require.define("/src/levels/intro/4.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C3%22%2C%22id%22%3A%22master%22%7D%2C%22bugFix%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22bugFix%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C2%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22bugFix%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout -b bugFix;git commit;git checkout master;git commit;git checkout bugFix;git rebase master",
  "name": "Rebase Introduction",
  "hint": "Make sure you commit from bugFix first",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Git Rebase",
            "",
            "The second way of combining work between branches is *rebasing.* Rebasing essentially takes a set of commits, \"copies\" them, and plops them down somewhere else.",
            "",
            "While this sounds confusing, the advantage of rebasing is that it can be used to make a nice linear sequence of commits. The commit log / history of the repository will be a lot cleaner if only rebasing is allowed.",
            "",
            "Let's see it in action..."
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Here we have two branches yet again; note that the bugFix branch is currently selected (note the asterisk)",
            "",
            "We would like to move our work from bugFix directly onto the work from master. That way it woud look like these two features were developed sequentially, when in reality they were developed in parallel.",
            "",
            "Let's do that with the `git rebase` command"
          ],
          "afterMarkdowns": [
            "Awesome! Now the work from our bugFix branch is right on top of master and we have a nice linear sequence of commits.",
            "",
            "Note that the commit C3 still exists somewhere (it has a faded appearance in the tree), and C3' is the \"copy\" that we rebased onto master.",
            "",
            "The only problem is that master hasn't been updated either, let's do that now..."
          ],
          "command": "git rebase master",
          "beforeCommand": "git commit; git checkout -b bugFix C1; git commit"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Now we are checked out on the `master` branch. Let's do ahead and rebase onto `bugFix`..."
          ],
          "afterMarkdowns": [
            "There! Since `master` was downstream of `bugFix`, git simply moved the `master` branch reference forward in history."
          ],
          "command": "git rebase bugFix",
          "beforeCommand": "git commit; git checkout -b bugFix C1; git commit; git rebase master; git checkout master"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "To complete this level, do the following",
            "",
            "* Checkout a new branch named `bugFix`",
            "* Commit once",
            "* Go back to master and commit again",
            "* Check out bugFix again and rebase onto master",
            "",
            "Good luck!"
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/intro/4.js");

require.define("/src/levels/intro/5.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C1%22%2C%22id%22%3A%22master%22%7D%2C%22pushed%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22pushed%22%7D%2C%22local%22%3A%7B%22target%22%3A%22C1%22%2C%22id%22%3A%22local%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C2%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22pushed%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git reset HEAD~1;git checkout pushed;git revert HEAD",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"pushed\":{\"target\":\"C2\",\"id\":\"pushed\"},\"local\":{\"target\":\"C3\",\"id\":\"local\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C1\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"local\",\"id\":\"HEAD\"}}",
  "name": "Reversing Changes in Git",
  "hint": "",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Reversing Changes in Git",
            "",
            "There are many ways to reverse changes in Git. And just like committing, reversing changes in Git has both a low-level component (staging individual files or chunks) and a high-level component (how the changes are actually reversed). Our application will focus on the latter.",
            "",
            "There are two primary ways to undo changes in Git -- one is using `git reset` and the other is using `git revert`. We will look at each of these in the next dialog",
            ""
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "## Git Reset",
            "",
            "`git reset` reverts changes by moving a branch reference backwards in time to an older commit. In this sense you can think of it as \"rewriting history;\" `git reset` will move a branch backwards as if the commit had never been made in the first place.",
            "",
            "Let's see what that looks like:"
          ],
          "afterMarkdowns": [
            "Nice! Git simply moved the master branch reference back to `C1`; now our local repository is in a state as if `C2` had never happened"
          ],
          "command": "git reset HEAD~1",
          "beforeCommand": "git commit"
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "## Git Revert",
            "",
            "While reseting works great for local branches on your own machine, it's method of \"rewriting history\" doesn't work for remote branches that others are using.",
            "",
            "In order to reverse changes and *share* those reversed changes with others, we need to use `git revert`. Let's see it in action"
          ],
          "afterMarkdowns": [
            "Weird, a new commit plopped down below the commit we wanted to reverse. That's because this new commit `C2'` introduces *changes* -- it just happens to introduce changes that exactly reverses the commit of `C2`.",
            "",
            "With resetting, you can push out your changes to share with others."
          ],
          "command": "git revert HEAD",
          "beforeCommand": "git commit"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "To complete this level, reverse the two most recent commits on both `local` and `pushed`.",
            "",
            "Keep in mind that `pushed` is a remote branch and `local` is a local branch -- that should help you chose your methods."
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/intro/5.js");

require.define("/src/levels/mixed/1.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "compareOnlyMaster": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C4%27%22%2C%22id%22%3A%22master%22%7D%2C%22debug%22%3A%7B%22target%22%3A%22C2%22%2C%22id%22%3A%22debug%22%7D%2C%22printf%22%3A%7B%22target%22%3A%22C3%22%2C%22id%22%3A%22printf%22%7D%2C%22bugFix%22%3A%7B%22target%22%3A%22C4%27%22%2C%22id%22%3A%22bugFix%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C4%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C4%22%7D%2C%22C4%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C4%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout master;git cherry-pick C4",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"debug\":{\"target\":\"C2\",\"id\":\"debug\"},\"printf\":{\"target\":\"C3\",\"id\":\"printf\"},\"bugFix\":{\"target\":\"C4\",\"id\":\"bugFix\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C3\"],\"id\":\"C4\"}},\"HEAD\":{\"target\":\"bugFix\",\"id\":\"HEAD\"}}",
  "name": "Grabbing Just 1 Commit",
  "hint": "Remember, interactive rebase or cherry-pick is your friend here",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Locally stacked commits",
            "",
            "Here's a development situation that often happens: I'm trying to track down a bug but it is quite elusive. In order to aid in my detective work, I put in a few debug commands and a few print statements.",
            "",
            "All of these debugging / print statements are in their own branches. Finally I track down the bug, fix it, and rejoice!",
            "",
            "Only problem is that I now need to get my `bugFix` back into the `master` branch! I could simply fast-forward `master`, but then `master` would get all my debug statements."
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "This is where the magic of Git comes in. There are a few ways to do this, but the two most straightforward ways are:",
            "",
            "* `git rebase -i`",
            "* `git cherry-pick`",
            "",
            "Interactive (the `-i`) rebasing allows you to chose which commits you want to keep or discard. It also allows you to reorder commits. This can be helpful if you want to toss out some work.",
            "",
            "Cherry-picking allows you to pick individual commits and plop them down on top of `HEAD`"
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "This is a later level so we will leave it up to you to decide, but in order to complete the level, make sure `master` receives the commit that `bugFix` references."
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/mixed/1.js");

require.define("/src/levels/mixed/2.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "disabledMap" : {
    "git cherry-pick": true
  },
  "compareOnlyMaster": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C3%27%27%22%2C%22id%22%3A%22master%22%7D%2C%22newImage%22%3A%7B%22target%22%3A%22C2%22%2C%22id%22%3A%22newImage%22%7D%2C%22caption%22%3A%7B%22target%22%3A%22C3%27%27%22%2C%22id%22%3A%22caption%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C3%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%27%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%27%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C2%27%27%22%3A%7B%22parents%22%3A%5B%22C3%27%22%5D%2C%22id%22%3A%22C2%27%27%22%7D%2C%22C2%27%27%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%27%27%22%7D%2C%22C3%27%27%22%3A%7B%22parents%22%3A%5B%22C2%27%27%27%22%5D%2C%22id%22%3A%22C3%27%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git rebase -i HEAD~2;git commit --amend;git rebase -i HEAD~2;git rebase caption master",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"newImage\":{\"target\":\"C2\",\"id\":\"newImage\"},\"caption\":{\"target\":\"C3\",\"id\":\"caption\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"caption\",\"id\":\"HEAD\"}}",
  "name": "Juggling Commits",
  "hint": "The first command is git rebase -i HEAD~2",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Juggling Commits",
            "",
            "Here's another situation that happens quite commonly. You have some changes (`newImage`) and another set of changes (`caption`) that are related, so they are stacked on top of each other in your repository (aka one after another).",
            "",
            "The tricky thing is that sometimes you need to make a small modification to an earlier commit. In this case, design wants us to change the dimensions of `newImage` slightly, even though that commit is way back in our history!!"
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "We will overcome this difficulty by doing the following:",
            "",
            "* We will re-order the commits so the one we want to change is on top with `git rebase -i`",
            "* We will `commit --amend` to make the slight modification",
            "* Then we will re-oder the commits back to how they were previously with `git rebase -i`",
            "* Finally, we will move master to this updated part of the tree to finish the level (via your method of choosing)",
            "",
            "There are many ways to accomplish this overall goal (I see you eye-ing cherry-pick), and we will see more of them later, but for now let's focus on this technique."
          ]
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "Lastly, pay attention to the goal state here -- since we move the commits twice, they both get an apostrophe appended. One more apostrophe is added for the commit we amend, which gives us the final form of the tree "
          ]
        }
      }
    ]
  }
};


});
require("/src/levels/mixed/2.js");

require.define("/src/levels/mixed/3.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C3%27%22%2C%22id%22%3A%22master%22%7D%2C%22newImage%22%3A%7B%22target%22%3A%22C2%22%2C%22id%22%3A%22newImage%22%7D%2C%22caption%22%3A%7B%22target%22%3A%22C3%22%2C%22id%22%3A%22caption%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C2%27%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%27%22%7D%2C%22C3%27%22%3A%7B%22parents%22%3A%5B%22C2%27%27%22%5D%2C%22id%22%3A%22C3%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout master;git cherry-pick C2;git commit --amend;git cherry-pick C3",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C1\",\"id\":\"master\"},\"newImage\":{\"target\":\"C2\",\"id\":\"newImage\"},\"caption\":{\"target\":\"C3\",\"id\":\"caption\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"caption\",\"id\":\"HEAD\"}}",
  "compareOnlyMaster": true,
  "name": "Juggling Commits #2",
  "hint": "Don't forget to forward master to the updated changes!",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Juggling Commits #2",
            "",
            "*If you haven't completed Juggling Commits #1 (the previous level), please do so before continuing*",
            "",
            "As you saw in the last level, we used `rebase -i` to reorder the commits. Once the commit we wanted to change was on top, we could easily --amend it and re-order back to our preferred order.",
            "",
            "The only issue here is that there is a lot of reordering going on, which can introduce rebase conflicts. Let's look at another method with `git cherry-pick`"
          ]
        }
      },
      {
        "type": "GitDemonstrationView",
        "options": {
          "beforeMarkdowns": [
            "Remember that git cherry-pick will plop down a commit from anywhere in the tree onto HEAD (as long as that commit isn't upstream).",
            "",
            "Here's a small refresher demo:"
          ],
          "afterMarkdowns": [
            "Nice! Let's move on"
          ],
          "command": "git cherry-pick C2",
          "beforeCommand": "git checkout -b bugFix; git commit; git checkout master; git commit"
        }
      },
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "So in this level, let's accomplish the same objective of amending `C2` once but avoid using `rebase -i`. I'll leave it up to you to figure it out! :D"
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/mixed/3.js");

require.define("/src/levels/rebase/1.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "compareOnlyMaster": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C7%27%22%2C%22id%22%3A%22master%22%7D%2C%22bugFix%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22bugFix%22%7D%2C%22side%22%3A%7B%22target%22%3A%22C6%27%22%2C%22id%22%3A%22side%22%7D%2C%22another%22%3A%7B%22target%22%3A%22C7%27%22%2C%22id%22%3A%22another%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C4%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C4%22%7D%2C%22C5%22%3A%7B%22parents%22%3A%5B%22C4%22%5D%2C%22id%22%3A%22C5%22%7D%2C%22C6%22%3A%7B%22parents%22%3A%5B%22C5%22%5D%2C%22id%22%3A%22C6%22%7D%2C%22C7%22%3A%7B%22parents%22%3A%5B%22C5%22%5D%2C%22id%22%3A%22C7%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C4%27%22%3A%7B%22parents%22%3A%5B%22C2%27%22%5D%2C%22id%22%3A%22C4%27%22%7D%2C%22C5%27%22%3A%7B%22parents%22%3A%5B%22C4%27%22%5D%2C%22id%22%3A%22C5%27%22%7D%2C%22C6%27%22%3A%7B%22parents%22%3A%5B%22C5%27%22%5D%2C%22id%22%3A%22C6%27%22%7D%2C%22C7%27%22%3A%7B%22parents%22%3A%5B%22C6%27%22%5D%2C%22id%22%3A%22C7%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git checkout bugFix;git rebase master;git checkout side;git rebase bugFix;git checkout another;git rebase side;git rebase another master",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C3\",\"id\":\"master\"},\"bugFix\":{\"target\":\"C2\",\"id\":\"bugFix\"},\"side\":{\"target\":\"C6\",\"id\":\"side\"},\"another\":{\"target\":\"C7\",\"id\":\"another\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C1\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C0\"],\"id\":\"C4\"},\"C5\":{\"parents\":[\"C4\"],\"id\":\"C5\"},\"C6\":{\"parents\":[\"C5\"],\"id\":\"C6\"},\"C7\":{\"parents\":[\"C5\"],\"id\":\"C7\"}},\"HEAD\":{\"target\":\"another\",\"id\":\"HEAD\"}}",
  "name": "Rebasing over 9000 times",
  "hint": "Remember, the most efficient way might be to only update master at the end...",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "### Rebasing Multiple Branches",
            "",
            "Man, we have a lot of branches going on here! Let's rebase all the work from these branches onto master.",
            "",
            "Upper management is making this a bit trickier though -- they want the commits to all be in sequential order. So this means that our final tree should show `C2`, `C3`, `C4'`, `C5'`, etc all in order.",
            "",
            "If you mess up along the way, feel free to use `reset` to start over again. Be sure to check our our solution and see if you can do it in fewer commands!"
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/rebase/1.js");

require.define("/src/levels/rebase/2.js",function(require,module,exports,__dirname,__filename,process,global){exports.level = {
  "compareOnlyBranches": true,
  "goalTreeString": "%7B%22branches%22%3A%7B%22master%22%3A%7B%22target%22%3A%22C5%22%2C%22id%22%3A%22master%22%7D%2C%22one%22%3A%7B%22target%22%3A%22C2%27%22%2C%22id%22%3A%22one%22%7D%2C%22two%22%3A%7B%22target%22%3A%22C2%27%27%22%2C%22id%22%3A%22two%22%7D%2C%22three%22%3A%7B%22target%22%3A%22C2%27%27%27%22%2C%22id%22%3A%22three%22%7D%7D%2C%22commits%22%3A%7B%22C0%22%3A%7B%22parents%22%3A%5B%5D%2C%22id%22%3A%22C0%22%2C%22rootCommit%22%3Atrue%7D%2C%22C1%22%3A%7B%22parents%22%3A%5B%22C0%22%5D%2C%22id%22%3A%22C1%22%7D%2C%22C2%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%22%7D%2C%22C3%22%3A%7B%22parents%22%3A%5B%22C2%22%5D%2C%22id%22%3A%22C3%22%7D%2C%22C4%22%3A%7B%22parents%22%3A%5B%22C3%22%5D%2C%22id%22%3A%22C4%22%7D%2C%22C5%22%3A%7B%22parents%22%3A%5B%22C4%22%5D%2C%22id%22%3A%22C5%22%7D%2C%22C4%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C4%27%22%7D%2C%22C3%27%22%3A%7B%22parents%22%3A%5B%22C4%27%22%5D%2C%22id%22%3A%22C3%27%22%7D%2C%22C2%27%22%3A%7B%22parents%22%3A%5B%22C3%27%22%5D%2C%22id%22%3A%22C2%27%22%7D%2C%22C5%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C5%27%22%7D%2C%22C4%27%27%22%3A%7B%22parents%22%3A%5B%22C5%27%22%5D%2C%22id%22%3A%22C4%27%27%22%7D%2C%22C3%27%27%22%3A%7B%22parents%22%3A%5B%22C4%27%27%22%5D%2C%22id%22%3A%22C3%27%27%22%7D%2C%22C2%27%27%22%3A%7B%22parents%22%3A%5B%22C3%27%27%22%5D%2C%22id%22%3A%22C2%27%27%22%7D%2C%22C2%27%27%27%22%3A%7B%22parents%22%3A%5B%22C1%22%5D%2C%22id%22%3A%22C2%27%27%27%22%7D%7D%2C%22HEAD%22%3A%7B%22target%22%3A%22master%22%2C%22id%22%3A%22HEAD%22%7D%7D",
  "solutionCommand": "git rebase -i HEAD~4;git branch -f master C5;git branch -f one C2';git rebase -i HEAD~4;git branch -f master C5;git branch -f two C2'';git rebase -i HEAD~4;git branch -f master C5;git branch -f three C2'''",
  "startTree": "{\"branches\":{\"master\":{\"target\":\"C5\",\"id\":\"master\"},\"one\":{\"target\":\"C1\",\"id\":\"one\"},\"two\":{\"target\":\"C1\",\"id\":\"two\"},\"three\":{\"target\":\"C1\",\"id\":\"three\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"},\"C4\":{\"parents\":[\"C3\"],\"id\":\"C4\"},\"C5\":{\"parents\":[\"C4\"],\"id\":\"C5\"}},\"HEAD\":{\"target\":\"master\",\"id\":\"HEAD\"}}",
  "name": "Branch Spaghetti",
  "hint": "Make sure to do everything in the proper order! Branch one first, then two, then three",
  "startDialog": {
    "childViews": [
      {
        "type": "ModalAlert",
        "options": {
          "markdowns": [
            "## Branch Spaghetti",
            "",
            "WOAHHHhhh Nelly! We have quite the goal to reach in this level.",
            "",
            "Here we have `master` that is a few commits ahead of branches `one` `two` and `three`. For whatever reason, we need to update these three other branches with modified versions of the last few commits on master.",
            "",
            "Branch `one` needs a re-ordering and a deletion. `two` needs pure reordering, and `three` only needs one commit!",
            "",
            "We will let you figure out how to solve this one -- make sure to check out our solution afterwards with `show solution`. "
          ]
        }
      }
    ]
  }
};

});
require("/src/levels/rebase/2.js");

})();
