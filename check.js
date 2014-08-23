var pythonParse = require("zed/lib/treehugger/python/parse");
require("zed/lib/treehugger/traverse");


module.exports = function(info) {
    var text = info.inputs.text;
    var ast = pythonParse.parse(text);
    var hints = [];
    ast.rewrite('ERROR()', function() {
        hints.push({
            row: this.getPos().sl - 1,
            text: "Parse error",
            type: 'error'
        });
        return this;
    });
    return hints;
};
