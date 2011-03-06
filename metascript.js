function MetaScriptFactory() {

var undefined, ms;

function log(msg) { ms.log(msg); };


///////////////////////////////////////////////////////////////////// Lexer

function Token(text, rule) {
  this.text = text;
  this.c = rule.n.charAt(0);
  this.n = rule.n;
}

Token.prototype.toString = function() {
  return this.c === "t" ? this.n + " \"" + this.text + "\"" : this.n;
};

Token.prototype.showAll = function(onlyT) {
  var t = this;
  var s = "";
  while(t) {
    if(!onlyT || t.isT()) {
      if(s.length) s += ", ";
      s += t.toString();
    }
    if(t.n === "s_end") break;
    t = t.next;
  }
  return s;
};

Token.prototype.toPrettyHTML = function(opts) {
  opts = opts || {};
  for(var t = this, s = ""; t; t = t.next) {
    if(t.n === "s_semi" && !opts.vsemi) continue;
    var text = t.text.replace(/</g, "&lt;");
    s += t.c === "w" ? text : "<span title=\""+t.n+"\" class=\"pretty_"+t.c+" pretty_"+t.n+"\">" + text + "</span>";
  }
  return s;
};

Token.prototype.isT = function() { return this.c === "t" || this.c === "s"; }

Token.prototype.append = function(t) {
  t.next = this.next;
  t.nextT = this.nextT;
  t.prev = this;
  if(this.isT()) {
    if(t.isT())
      for(var tt = this.next; tt !== this.nextT; tt = tt.next)
        tt.prevT = t;
    t.prevT = this;
  }
  else {
    if(t.isT())
      for(var tt = this.prev; tt !== this.prevT; tt = tt.prev)
        tt.nextT = t;
    t.prevT = this.prevT;
  }
  this.next.prev = t;
  this.next = t;
  if(t.isT()) this.nextT = t;
};

Token.newStart = function() {
  var t = new Token("", { n: "s_start" });
  t.line = 0;
  t.col = 0;
  t.offset = 0;
  return t;
};

Token.newEnd = function() { return new Token("", { n: "s_end" }); };

Token.newVSemi = function() { return new Token(";", { n: "s_semi" }); };

Token.tokenize = function(text, rules) {
  var start = Token.newStart(), prevT = start, prev = prevT;
  var line = 0, col = 0, offset = 0;
  function push(t) {
    t.line = line;
    t.col = col;
    t.offset = offset;
    offset += t.text.length;
    var lfmatches = t.text.match(/\r\n|\r|\n/g);
    if(lfmatches) {
      line += lfmatches.length;
      var lastmatch = lfmatches[lfmatches.length-1];
      col = t.text.length - t.text.lastIndexOf(lastmatch) - lastmatch.length;
    }
    else col += t.text.length;
    t.prevT = prevT;
    t.prev = prev;
    prev.next = t;
    prev = t;
    if(t.c === "t" || t.c === "s") prevT = t;
  }
  function classify(text, rule) {
    if(rule.classify) {
      for(var i=0; i<rule.classify.length; i++) {
        if(text.match(rule.classify[i].r))
          return classify(text, rule.classify[i]);
      }
    }
    return new Token(text, rule);
  }
  loop: while(text.length > 0) {
    for(var i=0; i<rules.length; i++) {
      var matches = text.match(rules[i].r);
      if(matches && matches[0].length > 0) {
        push(classify(matches[0], rules[i]));
        text = text.substring(matches[0].length);
        continue loop;
      }
    }
    start.error = "No token recognized";
    start.rest = text;
    break;
  }
  if(!start.error) push(Token.newEnd());
  var nextT = prev, cur = nextT.prev;
  while(true) {
    cur.nextT = nextT;
    if(cur.n === "s_start") break;
    if(cur.c === "t" || cur.c === "s") nextT = cur;
    cur = cur.prev;
  }
  return start;
}


///////////////////////////////////////////////////////////////////// Parser Combinators

function Success(val, rest) { this.val = val; this.rest = rest; };
Success.prototype.toString = function() {
  return "Success(" + this.val + " ;; " + this.rest + ")";
};

function Error(msg, rest) { this.msg = msg; this.rest = rest; };
Error.prototype.toString = function() {
  return "Error(" + this.msg + ", " + this.rest + ")";
};

function Parser(p) { this.parse = p; };

Parser.rec = function(f) { return new Parser(function(i) { return f().parse(i); }); }

Parser.choice = function() { var parsers = arguments; return new Parser(function(input) {
  var r;
  for(var i=0; i<parsers.length; i++) {
    r = parsers[i].parse(input);
    if(r instanceof Success) return r;
  }
  return r;
})}

Parser.result = function(v) { return new Parser(function(input) {
  return new Success(v, input);
})}

Parser.zero = function(msg) { return new Parser(function(input) {
  return new Error(msg, input);
})}

Parser.seq = function() { var parsers = arguments; return new Parser(function(input) {
  var res = [];
  for(var i=0; i<parsers.length; i++) {
    var p = parsers[i];
    var r = p.parse(input);
    if(r instanceof Error) return r;
    if(r.val !== null) res.push(r.val);
    input = r.rest;
  }
  return new Success(res, input);
})}

Parser.prototype.opt = function(otherwise) { var p = this; return new Parser(function(input) {
  var undefined;
  var r = p.parse(input);
  return (r instanceof Error) ? new Success(otherwise === undefined ? null : otherwise, input) : r;
})}

Parser.prototype.rep = function(min) { var p = this; return new Parser(function(input) {
  var res = [];
  while(true) {
    var r = p.parse(input);
    if(r instanceof Error) {
      if(min && res.length < min) return r;
      else return new Success(res, input);
    }
    res.push(r.val);
    input = r.rest;
  }
})}

Parser.prototype.or = function(q) { return Parser.choice(this, q); }

Parser.prototype.sep = function(q) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  input = r.rest;
  var res = [];
  if(r.val !== null) res.push(r.val);
  while(true) {
    var r2 = q.parse(input);
    if(r2 instanceof Error) break;
    var r3 = p.parse(r2.rest);
    if(r3 instanceof Error) break;
    input = r3.rest;
    if(r2.val !== null) res.push(r2.val);
    if(r3.val !== null) res.push(r3.val);
  }
  return new Success(res, input);
})}

Parser.prototype.chainl = function(q) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  input = r.rest;
  while(true) {
    var r2 = q.parse(input);
    if(r2 instanceof Error) return r;
    var r3 = p.parse(r2.rest);
    if(r3 instanceof Error) return r;
    input = r3.rest;
    r = new Success(r2.val(r.val, r3.val), input);
  }
})}

Parser.prototype.bind = function(f) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  return f(r.val).parse(r.rest);
})}

Parser.prototype.map = function(f) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  return new Success(f(r.val), r.rest);
})}

Parser.prototype.mapn = function(f) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  return new Success(new f(r.val), r.rest);
})}

Parser.prototype.mapv = function(v) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  return new Success(v, r.rest);
})}

Parser.prototype.seql = function(q) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  var r2 = q.parse(r.rest);
  if(r2 instanceof Error) return r2;
  return new Success(r.val, r2.rest);
})}

Parser.prototype.seqr = function(q) { var p = this; return new Parser(function(input) {
  var r = p.parse(input);
  if(r instanceof Error) return r;
  return q.parse(r.rest);
})}

Parser.n = function(n, re, tr) { return new Parser(function(input) {
  if(input.n !== n) return new Error("Expected token <"+n+">", input);
  if(re instanceof RegExp) {
    if(!input.text.match(re)) return new Error("Expected token matching "+re, input);
  } else {
    tr = re;
  }
  log("Consumed "+input+" in n("+n+")");
  if(tr !== undefined) {
    if(typeof tr === "function") return new Success(tr(input), input.nextT);
    else return new Success(tr, input.nextT);
  }
  else return new Success(input, input.nextT);
})}

Parser.t = function(t, tr) { return new Parser(function(input) {
  if(t instanceof RegExp) {
    if(!input.text.match(t)) return new Error("Expected token matching "+t, input);
  } else {
    if(input.text !== t) return new Error("Expected \""+t+"\"", input);
  }
  log("Consumed "+input+" in t("+t+")");
  if(tr !== undefined) {
    if(typeof tr === "function") return new Success(tr(input), input.nextT);
    else return new Success(tr, input.nextT);
  }
  else return new Success(input, input.nextT);
})}

var P = Parser;


///////////////////////////////////////////////////////////////////// Lexical Grammar

var tokenRules = [
  { n: "w_lf",         r: /^(\r\n|\r|\n)/ },
  { n: "w_space",      r: /^\s/ },
  { n: "c_line",       r: /^\/\/.*(\r\n|\r|\n|$)/ },
  { n: "c_inline",     r: /^\/\*([^\*]|(\*[^\/]))*\*\// },
  { n: "t_mstring",    r: /^"""(.|\r|\n)*"""/ },
  { n: "t_string",     r: /^"([^\\"\u0000-\u001F]|\\["'`\\btnfr])*"/ },
  { n: "t_hex",        r: /^0[xX][0-9a-fA-F]+/ },
  { n: "t_decimal",    r: /^\d+(\.\d+)?/ },
  { n: "t_dots",       r: /^\.+/ },
  { n: "t_op9",        r: /^(\/(?![\*\/])|[\:\?\+\-\*=\!&\|<>\^~%])+/, classify: [
    { n: "t_rdarrow",  r: /^=>$/ },
    { n: "t_larrow",   r: /^<-$/ },
    { n: "t_assignop", r: /^(=|[^<>\!=]=|[^=].+=)$/ },
    { n: "t_op8",      r: /^[\*\/\%]/ },
    { n: "t_op7",      r: /^[\+8\-]/ },
    { n: "t_op6",      r: /^[\:]/ },
    { n: "t_op5",      r: /^[\=\!]/ },
    { n: "t_op4",      r: /^[\<\>]/ },
    { n: "t_op3",      r: /^[\&]/ },
    { n: "t_op2",      r: /^[\^]/ },
    { n: "t_op1",      r: /^[\|]/ }
  ]},
  { n: "t_comma",      r: /^,/ },
  { n: "t_semi",       r: /^;/ },
  { n: "t_lparen",     r: /^\(/ },
  { n: "t_rparen",     r: /^\)/ },
  { n: "t_lbracket",   r: /^\[/ },
  { n: "t_rbracket",   r: /^\]/ },
  { n: "t_lbrace",     r: /^\{/ },
  { n: "t_rbrace",     r: /^\}/ },
  { n: "t_ident",      r: /^[\$_a-zA-Z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff\u0100-\u1fff\u3040-\u318f\u3300-\u337f\u3400-\u3d2d\u4e00-\u9fff\uf900-\ufaff][\$_a-zA-Z0-9\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff\u0100-\u1fff\u3040-\u318f\u3300-\u337f\u3400-\u3d2d\u4e00-\u9fff\uf900-\ufaff\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u09e6-\u09ef\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-\u0b6f\u0be7-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f\u0e50-\u0e59\u0ed0-\u0ed9\u1040-\u1049]*/, classify: [
    { n: "t_keyword",  r: /^(break|case|cast|catch|class|const|continue|debugger|default|delete|do|dynamic|else|false|final|finally|for|function|if|in|instanceof|interface|is|let|like|namespace|native|new|null|override|return|static|super|switch|this|throw|true|try|type|typeof|undefined|use|var|void|while|with|yield|__proto__)$/ }
  ]},
  { n: "t_qident",     r: /^`([^\\`\u0000-\u001F]|\\["'`\\btnfr])*`/ }
];


///////////////////////////////////////////////////////////////////// Layout

function insertVirtualSemicolons(input) {
  var params = P.n("t_ident").or(P.n("t_qident")).sep(P.t(","));
  var intro = params.opt().seqr(P.t("=>"));
  var scopes = [];
  for(var t = input; t.n !== "s_end"; t = t.next) {
    if(t.text === "[") scopes.push(t);
    else if(t.text === "{") {
      scopes.push(t);
      var r = intro.parse(t.nextT);
      var nextT = ((r instanceof Success) ? r.val : t).nextT;
      t.scopeIndent = nextT.col;
    } else if(t.text === "]") {
      var sc = scopes.pop();
      if(sc.n === "s_start") return new Error("Encountered ] without opening [", t);
      if(sc.text === "{") return new Error("No closing } for opening {", sc);
    } else if(t.text === "}") {
      var sc = scopes.pop();
      if(sc.n === "s_start") return new Error("Encountered } without opening {", t);
      if(sc.text === "[") return new Error("No closing ] for opening [", sc);
    } else if(t.n === "s_start") {
      scopes.push(t);
      t.scopeIndent = t.nextT.col;
    } else if(t.n === "s_end") {
      var sc = scopes.pop();
      if(sc.text === "[") return new Error("No closing ] for opening [", sc);
      if(sc.text === "{") return new Error("No closing } for opening {", sc);
    } else if(t.n === "w_lf" && (scopes[scopes.length-1].text === "{" || scopes[scopes.length-1].n === "s_start")) {
      var indent = scopes[scopes.length-1].scopeIndent;
      var ntt = t.nextT.text;
      if( t.nextT.n !== "s_end" && ntt !== "else" && ntt !== ";" && ntt !== "{" && ntt !== "}"
          && t.prevT.n !== "s_start" && t.prevT.text !== ";" && t.prevT.text !== "{" && t.prevT.text !== "=>") {
        if(t.nextT.col <= indent) {
          log("Inserting virtual semicolon after " + t.prevT);
          t.prevT.append(Token.newVSemi());
        }
      }
    }
  }
  return input;
}


///////////////////////////////////////////////////////////////////// AST Nodes

function ASTNode(nodeName) { this.nodeName = nodeName; }
ASTNode.prototype.toString = function() {
  var i = this.getNodeInfo();
  return i[0] + "(" + (i[1] || i[2]) + ")";
}
ASTNode.prototype.getNodeInfo = function() {
  return ["AST" + this.nodeName, null, this.children];
}
ASTNode.prototype.toPrettyHTML = function() {
  var s = "<ul>";
  function f(n, depth) {
    var i = (n && n.getNodeInfo) ? n.getNodeInfo() : [ n === null ? null : n.toString() ];
    if(n && n.getNodeInfo || i[0] === null) s += "<li>" + (i[0] === null ? "<i>null</i>" : i[0]);
    else s += "<li class=\"other\">" + i[0];
    if(i[1]) s += ": <span class=\"value\">" + i[1].replace(/</g, "&lt;") + "</span>";
    if(i[2]) {
      s += "<ul>";
      for(var j=0; j<i[2].length; j++)
        f(i[2][j], depth+1);
      s += "</ul>";
    }
    s += "</li>";
  }
  f(this, 0);
  return s + "</ul>";
};

function ASTSourceElements(children) { this.children = children; }
ASTSourceElements.prototype = new ASTNode("SourceElements");
ASTSourceElements.create = function(children) {
  if(children.length === 1) return children[0];
  else return new ASTSourceElements(children);
}

function ASTArrayLiteral(children) { this.children = children; }
ASTArrayLiteral.prototype = new ASTNode("ArrayLiteral");

function ASTOp(children) {
  this.children = children;
}
ASTOp.prototype = new ASTNode("Op");
ASTOp.create = function(children) {
  if(children.length === 1) return children[0];
  else return new ASTOp(children);
}

function ASTLiteral(nodeName) { this.nodeName = nodeName; }
ASTLiteral.prototype = new ASTNode("Literal");
ASTLiteral.prototype.getNodeInfo = function() { return ["AST" + this.nodeName, this.value]; }

function ASTDecimal(token) {
  this.token = token;
  this.value = token.text;
}
ASTDecimal.prototype = new ASTLiteral("Decimal");

function ASTHex(token) {
  this.token = token;
  this.value = token.text;
}
ASTHex.prototype = new ASTLiteral("Hex");

function ASTBoolean(token) {
  this.token = token;
  this.value = token.text;
}
ASTBoolean.prototype = new ASTLiteral("Boolean");

function ASTNull(token) {
  this.token = token;
  this.value = token.text;
}
ASTNull.prototype = new ASTNull("Null");

function ASTThis(token) {
  this.token = token;
  this.value = token.text;
}
ASTThis.prototype = new ASTNode("This");

function ASTUndefined(token) {
  this.token = token;
  if(token) this.value = token.text;
}
ASTUndefined.prototype = new ASTNode("Undefined");
ASTUndefined.empty = new ASTUndefined();

function ASTString(token) {
  this.token = token;
  this.value = token.text;
}
ASTString.prototype = new ASTLiteral("String");

function ASTMString(token) {
  this.token = token;
  this.value = token.text;
}
ASTMString.prototype = new ASTLiteral("MString");

function ASTIdent(token) {
  this.token = token;
  this.value = token.text;
}
ASTIdent.prototype = new ASTNode("Ident");
ASTIdent.prototype.getNodeInfo = function() {
  return ["AST" + this.nodeName, this.value];
}


///////////////////////////////////////////////////////////////////// Parser

var expr = P.rec(function() { return expr; });
var assign = P.rec(function() { return assign; });

var elementList = assign.opt(ASTUndefined.empty).sep(P.t(",", null));
var arrayLiteral = P.t("[").seqr(elementList).seql(P.t("]")).mapn(ASTArrayLiteral);

var primaryExpr = P.choice(
  P.t("this").mapn(ASTThis),
  P.t("null").mapn(ASTNull),
  P.t("true").or(P.t("false")).mapn(ASTBoolean),
  P.n("t_ident").mapn(ASTIdent),
  P.n("t_decimal").mapn(ASTDecimal),
  P.n("t_hex").mapn(ASTDecimal),
  P.n("t_string").mapn(ASTString),
  P.n("t_mstring").mapn(ASTMString),
  arrayLiteral,
  //-- object literal,
  P.t("(").seqr(expr).seql(P.t(")")) );

var infix9 = primaryExpr.sep(P.n("t_op9")).map(ASTOp.create);
var infix8 = infix9.sep(P.n("t_op8")).map(ASTOp.create);
var infix7 = infix8.sep(P.n("t_op7")).map(ASTOp.create);
var infix6 = infix7.sep(P.n("t_op6")).map(ASTOp.create);
var infix5 = infix6.sep(P.n("t_op5")).map(ASTOp.create);
var infix4 = infix5.sep(P.n("t_op4")).map(ASTOp.create);
var infix3 = infix4.sep(P.n("t_op3")).map(ASTOp.create);
var infix2 = infix3.sep(P.n("t_op2")).map(ASTOp.create);
var infix1 = infix2.sep(P.n("t_op1")).map(ASTOp.create);
var cond = P.seq(infix1, P.t("?"), assign, P.t(":"), assign).map(ASTOp.create).or(infix1);
var assign = infix1.sep(P.n("t_assignop")).map(ASTOp.create);
var expr = assign;
var statement = expr; //--
var sourceElement = statement; //-- statement.or(definition);
var statementSeparator = P.n("t_semi", null).or(P.n("s_semi", null));
var sourceElements = statementSeparator.rep().seqr(
  sourceElement.sep(statementSeparator.rep(1).mapv(null))).seql(
  statementSeparator.rep().opt()).map(ASTSourceElements.create);
var program = P.n("s_start").seqr(sourceElements).seql(P.n("s_end"));


/**
 * Perform some or all of the compilation phases.
 *
 * @param input The source code to compile (string)
 * @param opts Compiler options (object):
 *   - semi (boolean): Insert virtual semicolons
 *   - ast (boolean): Build AST (implies semi)
 * @return An object with the results:
 *   - errors: An array of errors. May include:
 *       - Token objects with .error message and .rest
 *       - Error objects
 *   - start: The start token after successful tokenization
 *       (may contain only some of the virtual semicolons if an error occurs
 *       while inferring semicolons)
 *   - ast: The AST
 */
function compile(input, opts) {
  opts = opts || {};
  var result = { errors: [] };
  log("Tokenizing input...");
  var start = Token.tokenize(input, tokenRules);
  if(start.error) result.errors.push(start);
  else {
    result.start = start;
    if(opts.semi || opts.ast) {
      log("Inserting virtual semicolons...");
      var semiInsert = insertVirtualSemicolons(start);
      if(semiInsert instanceof Error) result.errors.push(semiInsert);
      else {
        log("Parsing...");
        var ast = program.parse(start);
        if(ast instanceof Error) result.errors.push(ast);
        else {
          result.ast = ast.val;
        }
      }
    }
  }
  log("Finished compiling");
  return result;
}

ms = {
  log: function(msg) {},
  Token: Token,
  Success: Success,
  Error: Error,
  Parser: Parser,
  insertVirtualSemicolons: insertVirtualSemicolons,
  program: program,
  compile: compile
};
return ms;

}
