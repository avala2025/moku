// დროებითი მთავარი გვერდი (მე-4 ეტაპზე შეიცვლება ნამდვილი მაღაზიით)
const { layout } = require("./layout");

module.exports = function homePage() {
  return layout({
    title: "MOKU",
    description: "MOKU: ხის სათამაშოები",
    body: `<main class="soon">
  <div class="soon__mark">MOKU</div>
  <p class="soon__text">საიტი მუშაობს</p>
  <p class="soon__small">ხის სათამაშოები · მალე</p>
</main>`,
  });
};
