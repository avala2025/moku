// საერთო ჩარჩო ყველა გვერდისთვის: head, შრიფტები, ფერები
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function layout({ title, description = "", lang = "ka", body }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&family=Noto+Sans+Georgian:wght@300;400;500&family=Noto+Serif+Georgian:wdth,wght@62.5..100,200..500&display=swap">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
${body}
</body>
</html>`;
}

module.exports = { layout, esc };
