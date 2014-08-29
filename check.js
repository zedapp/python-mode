var pythonParse = require("zed/lib/treehugger/python/parse");
var Sk = require("zed/lib/treehugger/python/skulpt.min");
require("zed/lib/treehugger/traverse");

function Scope(parent) {
    this.parent = parent;
    this.vars = {};
}

Scope.prototype = {
    set: function(name, val) {
        this.vars[name] = val;
    },
    get: function(name) {
        return this.vars[name] || (this.parent && this.parent.get(name));
    }
};

function initRootScope(scope) {
    Object.keys(Sk.builtins).forEach(function(builtin) {
        scope.set(builtin, true);
    });
    // Constants
    scope.set("True", true);
    scope.set("False", true);
    scope.set("None", true);
    scope.set("NotImplemented", true);
    scope.set("Ellipsis", true);
    scope.set("__debug__", true);
    scope.set("__name__", true);
}

module.exports = function(info) {
    var text = info.inputs.text;
    var ast = pythonParse.parse(text);
    var hints = [];
    var rootScope = new Scope();
    initRootScope(rootScope);
    ast.rewrite('ERROR()', function() {
        hints.push({
            row: this.getPos().sl - 1,
            text: "Parse error",
            type: 'error'
        });
        return this;
    }, function() {
        if(info.enableSemanticChecks) {
            scopeAnalyzer(rootScope, this);
        }
    });
    // console.log(ast.toPrettyString(), hints);
    return hints;

    function scopeAnalyzer(scope, node) {
        node.traverseTopDown('Assign(l, val)', function(b) {
            b.l.traverseTopDown('Var(x)', function(b) {
                scope.set(b.x.value, true);
            });
        }, 'Alias(x, as)', function(b) {
            b.as.rewrite('None()', function() {
                // None? Then use the x name
                scope.set(b.x.value, true);
                return this;
            }, 'x', function(b) {
                // Otherwise, use the as alias
                scope.set(b.x.value, true);
            });
        }, 'FunctionDef(annos, name, Args(args, _defaults, starargs, kwargs), Block(stms))', function(b) {
            // Declare function name as variable
            // console.log("Function def", b);
            scope.set(b.name.value, true);
            // Create new scope and declare args as variables
            var newScope = new Scope(scope);
            b.args.each('Var(x)', function(b) {
                newScope.set(b.x.value, true);
            });
            b.starargs.rewrite('None()', function() {
                // Do nuthin'
                return this;
            }, 'x', function(b) {
                newScope.set(b.x.value, true);
            });
            b.kwargs.rewrite('None()', function() {
                // Do nuthin'
                return this;
            }, 'x', function(b) {
                newScope.set(b.x.value, true);
            });
            scopeAnalyzer(newScope, b.stms);
            return this;
        }, 'For(itvar, iterator, Block(stms))', function(b) {
            scopeAnalyzer(scope, b.iterator);
            var itvar = b.itvar[0].value;
            var oldIterVal = scope.get(itvar);
            scope.set(itvar, true);
            scopeAnalyzer(scope, b.stms);
            scope.set(itvar, oldIterVal);
            return this;
        }, 'ClassDef(annos, name, _, decls)', function(b) {
            console.log("ClassDef", b);
            // Declare class name as variable
            scope.set(b.name.value, true);
        }, 'Var(x)', function(b) {
            if (!scope.get(b.x.value)) {
                var pos = this.getPos();
                console.log("Undefined", b.x.value, pos);
                hints.push({
                    row: pos.sl - 1,
                    column: pos.sc,
                    endColumn: pos.ec,
                    type: 'warning',
                    text: "Undeclared: " + b.x.value
                });
            }
        });
    }
};
