window.ignition.controller(function(state, api) {
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'login-btn') {
      state.user.loggedIn = true;
      state.user.name = 'Алексей';
      state.user.favorites = [123, 456];
    }
    if (e.target && e.target.id === 'toggle-favorite') {
      if (state.user.loggedIn) {
        state.user.favorites.push(789);
      }
    }
  });
});
