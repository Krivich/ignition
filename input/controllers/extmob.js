window.ignition.controller(function(state, api) {
  function validate() {
    const c = state.candidate;
    state.ui.isValid =
      String(c.email || '').includes('@') &&
      String(c.position || '').trim() !== '' &&
      Array.isArray(state.skills) && state.skills.length > 0;
  }

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'addSkillBtn') {
      const name = String(state.ui.newSkill || '').trim();
      if (name) {
        state.skills.push({ name, level: 1 });
        state.ui.newSkill = '';
        window.ignition.ephemeral('ui.toastMessage', `Добавлен навык: ${name}`, 2600);
        validate();
      }
    }
  });

  document.addEventListener('input', () => validate());

  document.getElementById('offerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.ui.isValid) {
      window.ignition.ephemeral('ui.toastMessage', 'Анкета опубликована', 2600);
    }
  });

  validate();
});
