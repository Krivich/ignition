window.ignition.controller(function(state, api) {
    function filterProducts(s) {
        var items = s.products.items;
        if (s.ui.activeCategory !== 'all') {
            items = items.filter(function(p) { return p.category === s.ui.activeCategory; });
        }
        if (s.ui.searchQuery) {
            var q = s.ui.searchQuery.toLowerCase();
            items = items.filter(function(p) { return p.name.toLowerCase().indexOf(q) !== -1; });
        }
        return { items: items };
    }

    state.filteredProducts = filterProducts(state);
    state.subscribe('*', function() {
        state.filteredProducts = filterProducts(state);
    });

    api.blockOptions.renderers['catalog/product-list'] = function(s) {
        return s.filteredProducts;
    };
    api.blockOptions.renderers['catalog/cart-header'] = function(s) { return s.cart; };
    api.blockOptions.renderers['catalog/cart-details'] = function(s) { return s.cart; };
    api.blockOptions.sourceDeps['catalog/product-list'] = ['products', 'ui'];

    // Controller events via native delegation
    document.body.addEventListener('click', function(e) {
        var btn = e.target.closest('.add-to-cart');
        if (btn) {
            e.preventDefault();
            var id = +btn.getAttribute('data-id');
            var price = +btn.getAttribute('data-price');
            var name = btn.getAttribute('data-name');
            state.cart.items.push({ id: id, price: price, name: name });
            return;
        }
        var removeBtn = e.target.closest('.remove-from-cart');
        if (removeBtn) {
            e.preventDefault();
            var rid = +removeBtn.getAttribute('data-id');
            for (var i = 0; i < state.cart.items.length; i++) {
                if (state.cart.items[i].id === rid) {
                    state.cart.items.splice(i, 1);
                    break;
                }
            }
        }
    });
});
