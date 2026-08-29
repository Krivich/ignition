window.ignition.controller(function(state, api) {
    function recomputeAll(s) {
        var sales = s.metrics.sales;
        var total = 0;
        for (var i = 0; i < sales.length; i++) total += sales[i].amount;
        s.totalSales = total;
        s.avgSales = sales.length ? Math.round(total / sales.length) : 0;
        var best = null;
        for (var i = 0; i < sales.length; i++) {
            if (!best || sales[i].amount > best.amount) best = sales[i];
        }
        s.bestDay = best || { date: '-', amount: 0 };
        s.filteredSales = sales;
    }
    recomputeAll(state);
    state.subscribe('*', function() { recomputeAll(state); });

    api.blockOptions.renderers['dashboard/summary'] = function(s) {
        return { metrics: s.metrics, totalSales: s.totalSales, avgSales: s.avgSales };
    };
    api.blockOptions.renderers['dashboard/sales-list'] = function(s) {
        return { metrics: s.metrics, filteredSales: s.filteredSales };
    };
    api.blockOptions.renderers['dashboard/best-day'] = function(s) {
        return { metrics: s.metrics, bestDay: s.bestDay };
    };
    api.blockOptions.renderers['dashboard/footer'] = function(s) {
        return { metrics: s.metrics, totalSales: s.totalSales, bestDay: s.bestDay };
    };

    document.getElementById('refreshBtn').addEventListener('click', function() {
        state.metrics.loading = true;
        setTimeout(function() {
            state.metrics.sales = [
                { date: '2026-08-04', amount: 12000 },
                { date: '2026-08-05', amount: 19000 },
                { date: '2026-08-06', amount: 15000 }
            ];
            state.metrics.loading = false;
        }, 100);
    });
});