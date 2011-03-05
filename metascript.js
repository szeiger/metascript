function MetaScriptFactory() {

var undefined, ms;

function log(msg) { ms.log(msg); };


///////////////////////////////////////////////////////////////////// Tokens

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


///////////////////////////////////////////////////////////////////// Lexer

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

function tokenize(text) {
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
    for(var i=0; i<tokenRules.length; i++) {
      var matches = text.match(tokenRules[i].r);
      if(matches && matches[0].length > 0) {
        push(classify(matches[0], tokenRules[i]));
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

function tn(n, re, tr) { return function(input) {
  if(input.n !== n) return new Error("Expected token <"+n+">", input);
  if(re instanceof RegExp) {
    if(!input.text.match(re)) return new Error("Expected token matching "+re, input);
  } else {
    tr = re;
  }
  log("Consumed "+input+" in tn("+n+")");
  if(tr !== undefined) {
    if(typeof tr === "function") return new Success(tr(input), input.nextT);
    else return new Success(tr, input.nextT);
  }
  else return new Success(input, input.nextT);
}}

function tt(t, tr) { return function(input) {
  if(t instanceof RegExp) {
    if(!input.text.match(t)) return new Error("Expected token matching "+t, input);
  } else {
    if(input.text !== t) return new Error("Expected \""+t+"\"", input);
  }
  log("Consumed "+input+" in tt("+t+")");
  if(tr !== undefined) {
    if(typeof tr === "function") return new Success(tr(input), input.nextT);
    else return new Success(tr, input.nextT);
  }
  else return new Success(input, input.nextT);
}}

function seq() { var parsers = arguments; return function(input) {
  var res = [], stop = false;
  for(var i=0; i<parsers.length; i++) {
    var p = parsers[i];
    if(p === ">") res = [];
    else if(p === "<") stop = true;
    else if(p === "<*") { stop = true; res = res[0]; }
    else {
      var r = parsers[i](input);
      if(r instanceof Error) return r;
      if(r.val !== null && !stop) res.push(r.val);
      input = r.rest;
    }
  }
  return new Success(res, input);
}}

function opt(p) { return function(input) {
  var r = p(input);
  return (r instanceof Error) ? new Success(null, input) : r;
}}

function choice() { var parsers = arguments; return function(input) {
  var r;
  for(var i=0; i<parsers.length; i++) {
    r = parsers[i](input);
    if(r instanceof Success) return r;
  }
  return r;
}}

function rep(p, min) { return function(input) {
  var res = [];
  while(true) {
    var r = p(input);
    if(r instanceof Error) {
      if(min && res.length < min) return r;
      else return new Success(res, input);
    }
    res.push(r.val);
    input = r.rest;
  }
}}

function chainl(p, q) { return function(input) {
  var r = p(input);
  if(r instanceof Error) return r;
  input = r.rest;
  while(true) {
    var r2 = q(input);
    if(r2 instanceof Error) return r;
    var r3 = p(r2.rest);
    if(r3 instanceof Error) return r;
    input = r3.rest;
    r = new Success(r2.val(r.val, r3.val), input);
  }
}}

function tr(p, f) { return function(input) {
  var r = p(input);
  if(r instanceof Error) return r;
  return new Success(f(r.val), r.rest);
}}

function trn(p, f) { return function(input) {
  var r = p(input);
  if(r instanceof Error) return r;
  return new Success(new f(r.val), r.rest);
}}

function trv(p, v) { return function(input) {
  var r = p(input);
  if(r instanceof Error) return r;
  return new Success(v, r.rest);
}}

function sep(p, q) { return function(input) {
  var r = p(input);
  if(r instanceof Error) return r;
  input = r.rest;
  var res = [r.val];
  while(true) {
    var r2 = q(input);
    if(r2 instanceof Error) break;
    var r3 = p(r2.rest);
    if(r3 instanceof Error) break;
    input = r3.rest;
    if(r2.val !== null) res.push(r2.val);
    if(r3.val !== null) res.push(r3.val);
  }
  return new Success(res, input);
}}


///////////////////////////////////////////////////////////////////// Layout

function insertVirtualSemicolons(input) {
  var params = sep(choice(tn("t_ident"), tn("t_qident")), tt(","));
  var intro = seq(opt(params), tt("=>"));
  var scopes = [];
  for(var t = input; t.n !== "s_end"; t = t.next) {
    if(t.text === "[") scopes.push(t);
    else if(t.text === "{") {
      scopes.push(t);
      var r = intro(t.nextT);
      var nextT = ((r instanceof Success) ? r.val[r.val.length-1] : t).nextT;
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
    var i = n.getNodeInfo ? n.getNodeInfo() : [n.toString()];
    s += (n.getNodeInfo ? "<li>" : "<li class=\"other\">") + i[0];
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

function ASTSourceElements(children) {
  this.children = children;
}
ASTSourceElements.prototype = new ASTNode("SourceElements");
ASTSourceElements.create = function(children) {
  if(children.length === 1) return children[0];
  else return new ASTSourceElements(children);
}

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
ASTLiteral.prototype.getNodeInfo = function() {
  return ["AST" + this.nodeName, this.value];
}

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
ASTThis.prototype = new ASTThis("This");

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

var expr = function(i) { return expr(i); }
var assign = function(i) { return assign(i); }

var primaryExpr = choice(
  trn(tt("this"), ASTThis),
  trn(tt("null"), ASTNull),
  trn(choice(tt("true"), tt("false")), ASTBoolean),
  trn(tn("t_ident"), ASTIdent),
  trn(tn("t_decimal"), ASTDecimal),
  trn(tn("t_hex"), ASTDecimal),
  trn(tn("t_string"), ASTString),
  trn(tn("t_mstring"), ASTMString),
  //-- array literal,
  //-- object literal,
  seq(tt("("), ">", expr, "<*", tt(")")) );

var infix9 = tr(sep(primaryExpr, tn("t_op9")), ASTOp.create);
var infix8 = tr(sep(infix9, tn("t_op8")), ASTOp.create);
var infix7 = tr(sep(infix8, tn("t_op7")), ASTOp.create);
var infix6 = tr(sep(infix7, tn("t_op6")), ASTOp.create);
var infix5 = tr(sep(infix6, tn("t_op5")), ASTOp.create);
var infix4 = tr(sep(infix5, tn("t_op4")), ASTOp.create);
var infix3 = tr(sep(infix4, tn("t_op3")), ASTOp.create);
var infix2 = tr(sep(infix3, tn("t_op2")), ASTOp.create);
var infix1 = tr(sep(infix2, tn("t_op1")), ASTOp.create);
var cond = choice(tr(seq(infix1, tt("?"), assign, tt(":"), assign), ASTOp.create), infix1);
var assign = tr(sep(infix1, tn("t_assignop")), ASTOp.create);
var expr = assign;
var statement = expr; //--
var sourceElement = statement; //-- choice(statement, definition);
var statementSeparator = choice(tn("t_semi", null), tn("s_semi", null));
var sourceElements = tr(seq(rep(statementSeparator, 0), ">",
  sep(sourceElement, trv(rep(statementSeparator, 1), null)),
  "<*", opt(rep(statementSeparator, 0))), ASTSourceElements.create);
var program = seq(tn("s_start"), ">", sourceElements, "<*", tn("s_end"));


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
  var start = tokenize(input);
  if(start.error) result.errors.push(start);
  else {
    result.start = start;
    if(opts.semi || opts.ast) {
      log("Inserting virtual semicolons...");
      var semiInsert = insertVirtualSemicolons(start);
      if(semiInsert instanceof Error) result.errors.push(semiInsert);
      else {
        log("Parsing...");
        var ast = program(start);
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
  tokenize: tokenize,
  Success: Success,
  Error: Error,
  insertVirtualSemicolons: insertVirtualSemicolons,
  program: program,
  compile: compile
};
return ms;

}
