// დროებითი მთავარი გვერდი (მე-4 ეტაპზე შეიცვლება ნამდვილი მაღაზიით)
const { layout, esc } = require("./layout");

module.exports = function homePage(db) {
  const status = db.ok
    ? `<p class="soon__db soon__db--ok">ბაზა დაკავშირებულია</p>`
    : `<p class="soon__db soon__db--bad">ბაზა: ${esc(db.reason)}</p>`;
  return layout({
    title: "MOKU",
    description: "MOKU: ხის სათამაშოები",
    body: `<main class="soon">
  <div class="soon__mark">MOKU</div>
  <p class="soon__text">საიტი მუშაობს</p>
  <p class="soon__small">ხის სათამაშოები · მალე</p>
  ${status}
</main>`,
  });
};
