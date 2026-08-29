window.ignition.controller(function(state, api) {
    api.blockOptions.renderers['form/contact'] = function(s) { return s; };

    function validate(s) {
        var errors = {};
        if (!s.form.fields.name) errors.name = 'Обязательное поле';
        if (!s.form.fields.email) errors.email = 'Обязательное поле';
        else if (s.form.fields.email.indexOf('@') === -1) errors.email = 'Некорректный email';
        if (!s.form.fields.message) errors.message = 'Обязательное поле';
        s.form.errors = errors;
        return Object.keys(errors).length === 0;
    }

    document.body.addEventListener('submit', function(e) {
        if (e.target.id !== 'contactForm') return;
        e.preventDefault();
        var valid = validate(state);
        if (!valid) return;
        state.form.submitting = true;
        setTimeout(function() {
            state.form.submitting = false;
            state.form.submitted = true;
        }, 500);
    });

    document.body.addEventListener('click', function(e) {
        if (e.target.id === 'resetBtn') {
            state.form.fields = { name: '', email: '', message: '' };
            state.form.errors = {};
            state.form.submitting = false;
            state.form.submitted = false;
        }
    });

    state.subscribe('form.fields', function() { validate(state); });

    function updateButton() {
        var btn = document.querySelector('button[type="submit"]');
        if (!btn) return;
        var valid = Object.keys(state.form.errors).length === 0;
        var hasValues = state.form.fields.name && state.form.fields.email && state.form.fields.message;
        btn.disabled = !(valid && hasValues);
    }
    state.subscribe('form', function() { updateButton(); });
    setTimeout(updateButton, 0);

    document.addEventListener('focusout', function(e) {
        if (e.target.matches('input, textarea')) {
            validate(state);
            updateButton();
        }
    });
});