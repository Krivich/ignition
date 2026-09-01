window.ignition.controller(function (state, api) {
  var bumpBtn = document.getElementById('bumpBtn');
  var addBtn = document.getElementById('addBtn');
  var addTopBtn = document.getElementById('addTopBtn');
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

  addBtn.addEventListener('click', function () {
    var n = state.products.length + 1;
    state.products.push({ id: n, name: 'Товар ' + n, price: n * 1000 });
    state.log.msg = 'добавлен products[' + (n - 1) + '] (структурное: ре-рендер блока)';
  });

  addTopBtn.addEventListener('click', function () {
    var n = state.products.length + 1;
    state.products.unshift({ id: n, name: 'Товар ' + n, price: n * 1000 });
    state.log.msg = 'вставлен products[0] (структурное: ре-рендер блока)';
  });

  resetBtn.addEventListener('click', function () {
    location.reload();
  });
});