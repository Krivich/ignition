# Кейс 3: Дашборд — edge cases

## Структура данных

```json
{
  "metrics": {
    "sales": [...],
    "loading": false,
    "error": null
  },
  "ui": { "period": "week" }
}
```

## Грабли, которые тестируем

### 1. Четыре блока на одни данные
Все 4 виджета (summary, sales-list, best-day, footer) читают `metrics.sales`.
При обновлении данных — все 4 должны перерендериться.

**Грабль:** если mechanism обновляет блоки поshedule — нужно гарантиять, что все 4 обновятся за один цикл, не по одному.

### 2. Computed от computed
`totalSales` зависит от `metrics.sales`.
`avgSales` зависит от `totalSales` + `metrics.sales.length`.
`bestDay` зависит от `metrics.sales`.

**Грабль:** если computed не ленивые — при инициализации порядок вычисления важен.
Если ленивые — при первом обращении к `avgSales` нужно, чтобы `totalSales` уже был вычислен.

### 3. Переключатель периода
`ui.period` меняется → `filteredSales` пересчитывается → sales-list обновляется.

**Грабль:** `filteredSales` зависит от `ui.period` + `metrics.sales`.
Если period = "week" — показываем последние 7 дней. Если "month" — все.
Но в наших данных только 3 дня — это осознанно, для теста.

### 4. Кнопка "Обновить"
`metricsRefresh()` → `metrics.loading = true` → все блоки показывают скелетон →
имитация загрузки → `metrics.loading = false`, `metrics.sales = [...]`.

**Грабль:** два последовательных set: loading=true, потом loading=false + sales.
Если Proxy батчит — пользователь не увидит спиннер.

### 5. Множественные зависимости блока
Footer depends на `totalSales` и `bestDay`. Оба — computed.
**Грабль:** если computed пересчитываются независимо — footer может обновиться дважды.
Нужен batching: все computed пересчитаны → один re-render.
