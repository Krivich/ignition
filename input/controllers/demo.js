window.ignition.controller(function (state, api) {
  var bumpBtn = document.getElementById('bumpBtn');
  var resetBtn = document.getElementById('resetBtn');

  function flashPrice() {
    var cell = document.querySelector('.product .p-price');
    if (cell) { cell.classList.remove('flash'); void cell.offsetWidth; cell.classList.add('flash'); }
  }

  bumpBtn.addEventListener('click', function () {
    var i = Math.floor(Math.random() * state.products.length);
    state.products[i].price += 1;
    state.log.msg = 'products[' + i + '].price -> ' + state.products[i].price + ' (точечное обновление)';
    flashPrice();
  });

  resetBtn.addEventListener('click', function () {
    location.reload();
  });
});
