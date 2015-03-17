var assert = require("assert");
var recast = require("..");
var types = require("../lib/types");
var n = types.namedTypes;
var b = types.builders;
var patcherModule = require("../lib/patcher");
var getReprinter = patcherModule.getReprinter;
var Patcher = patcherModule.Patcher;
var fromString = require("../lib/lines").fromString;
var parse = require("../lib/parser").parse;
var FastPath = require("../lib/fast-path");

var code = [
    "// file comment",
    "exports.foo({",
    "    // some comment",
    "    bar: 42,",
    "    baz: this",
    "});"
];

function loc(sl, sc, el, ec) {
    return {
        start: { line: sl, column: sc },
        end: { line: el, column: ec }
    };
}

describe("patcher", function() {
    it("Patcher", function() {
        var lines = fromString(code.join("\n")),
            patcher = new Patcher(lines),
            selfLoc = loc(5, 9, 5, 13);

        assert.strictEqual(patcher.get(selfLoc).toString(), "this");

        patcher.replace(selfLoc, "self");

        assert.strictEqual(patcher.get(selfLoc).toString(), "self");

        var got = patcher.get().toString();
        assert.strictEqual(got, code.join("\n").replace("this", "self"));

        // Make sure comments are preserved.
        assert.ok(got.indexOf("// some") >= 0);

        var oyezLoc = loc(2, 12, 6, 1),
            beforeOyez = patcher.get(oyezLoc).toString();
        assert.strictEqual(beforeOyez.indexOf("exports"), -1);
        assert.ok(beforeOyez.indexOf("comment") >= 0);

        patcher.replace(oyezLoc, "oyez");

        assert.strictEqual(patcher.get().toString(), [
            "// file comment",
            "exports.foo(oyez);"
        ].join("\n"));

        // "Reset" the patcher.
        patcher = new Patcher(lines);
        patcher.replace(oyezLoc, "oyez");
        patcher.replace(selfLoc, "self");

        assert.strictEqual(patcher.get().toString(), [
            "// file comment",
            "exports.foo(oyez);"
        ].join("\n"));
    });

    var trickyCode = [
        "    function",
        "      foo(bar,",
        "  baz) {",
        "        qux();",
        "    }"
    ].join("\n");

    it("GetIndent", function() {
        function check(indent) {
            var lines = fromString(trickyCode).indent(indent);
            var file = parse(lines.toString());
            var reprinter = FastPath.from(file).call(function(bodyPath) {
                return getReprinter(bodyPath);
            }, "program", "body", 0, "body");

            var reprintedLines = reprinter(function(path) {
                assert.ok(false, "should not have called print function");
            });

            assert.strictEqual(reprintedLines.length, 3);
            assert.strictEqual(reprintedLines.getIndentAt(1), 0);
            assert.strictEqual(reprintedLines.getIndentAt(2), 4);
            assert.strictEqual(reprintedLines.getIndentAt(3), 0);
            assert.strictEqual(reprintedLines.toString(), [
                "{",
                "    qux();",
                "}"
            ].join("\n"));
        }

        for (var indent = -4; indent <= 4; ++indent) {
            check(indent);
        }
    });

    it("should patch return/throw/etc. arguments correctly", function() {
        var strAST = parse('return"foo"');
        var returnStmt = strAST.program.body[0];
        n.ReturnStatement.assert(returnStmt);
        assert.strictEqual(
            recast.print(strAST).code,
            'return"foo"'
        );

        returnStmt.argument = b.literal(null);
        assert.strictEqual(
            recast.print(strAST).code,
            "return null" // Instead of returnnull.
        );

        var arrAST = parse("throw[1,2,3]");
        var throwStmt = arrAST.program.body[0];
        n.ThrowStatement.assert(throwStmt);
        assert.strictEqual(
            recast.print(arrAST).code,
            "throw[1,2,3]"
        );

        throwStmt.argument = b.literal(false);
        assert.strictEqual(
            recast.print(arrAST).code,
            "throw false" // Instead of throwfalse.
        );
    });
});
