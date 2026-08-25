# Кейс 2: Форма обратной связи — edge cases

## Структура данных

```json
{
  "form": {
    "fields": { "name": "", "email": "", "message": "" },
    "errors": {},
    "submitting": false,
    "submitted": false
  }
}
```

## Грабли, которые тестируем

### 1. Вложенные пути в Proxy
`form.fields.name`, `form.errors.name` — Proxy должен отслеживать глубокие set.
При `state.form.fields.name = "Тест"` → путь `form.fields.name`.

**Грабль:** если Proxy оборачивает только верхний уровень — вложенные объекты не реактивны.
Нужна ленивая оборачивание вложенных объектов при get.

### 2. Валидация на лету
Печатаю в поле → `state.form.fields.name` меняется → computed `errors` пересчитывается → блок ошибки появляется/исчезает.

**Грабль:** цепочка binding → state → computed → re-render. Если computed не подписывается на глубокие пути — не сработает.

### 3. Три состояния одного блока
Форма → Спиннер → Благодарность — три состояния, один `data-ignition-block`.
`{{#if form.submitted}}...{{else if form.submitting}}...{{else}}...{{/if}}`

**Грабль:** Handlebars не имеет `else if` напрямую. Нужно проверить, как Handlebars компилирует嵌套 `{{#if}}...{{else}}{{#if}}...{{/if}}{{/if}}`.
На самом деле `{{else if}}` — это sugar для `{{else}}{{#if}}...{{/if}}`.

### 4. Disabled кнопка
`isFormValid` computed зависит от всех трёх полей + ошибок.
Кнопка disabled, пока форма невалидна.

**Гrabль:** disabled атрибут через Handlebars: `disabled={{#unless isFormValid}}disabled{{/unless}}`.
Нужно проверить, как это рендерится — Handlebars может не выводить disabled когда true.

### 5. Сброс формы
`formReset()` → `state.form.fields = { name: '', email: '', message: '' }` + `state.form.submitted = false`.
После сброса форма снова видна, computed errors пересчитываются.

**Грабль:** замена объекта fields — Proxy должен перехватить set на `form.fields` и你知道, что все дочерние пути изменились.

### 6. Асинхронная операция
`formSubmit()` → async → `submitting: true` → await fetch → `submitted: true`.
Нужно, чтобы блок обновился дважды: сначала на спиннер, потом на благодарность.

**Грабль:** если Proxy батчит обновления через requestAnimationFrame — второй set может не вызвать второй re-render до следующего кадра.
Нужен flush промежуточных состояний илиicrotask для loading/state.
