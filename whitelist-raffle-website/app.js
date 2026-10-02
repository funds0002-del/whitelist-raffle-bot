async function getRaffles() {
  const response = await fetch('/api/raffles');
  return response.json();
}

function renderList(raffles) {
  const list = document.getElementById('raffle-list');
  if (!list) return;

  const active = (raffles || []).filter(raffle => raffle.status === 'active');
  if (!active.length) {
    list.innerHTML = '<p class="meta">No active raffles right now.</p>';
    return;
  }

  list.innerHTML = active.map(raffle => `
    <article class="card">
      <div class="banner" style="${raffle.banner ? 'background-image:url(' + raffle.banner + ');background-size:cover;' : ''}"></div>
      <div class="card-body">
        <div class="status">${raffle.status}</div>
        <h3>${raffle.title}</h3>
        <p class="meta">${raffle.id} • ${raffle.entries} entries • ${raffle.winners} winners</p>
        <a class="btn" href="raffle.html?id=${raffle.id}">View raffle</a>
      </div>
    </article>
  `).join('');
}

async function renderRafflePage(raffles) {
  const title = document.getElementById('title');
  if (!title) return;

  const meRes = await fetch('/api/me');
  const me = await meRes.json();
  const discordBox = document.getElementById('discord-id');
  if (me && me.id && discordBox) {
    discordBox.parentElement.style.display = 'none';
    const result = document.getElementById('result');
    if (result && !result.textContent) result.textContent = 'Logged in as ' + me.username;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const raffle = (raffles || []).find(item => item.id === id);
  if (!raffle) {
    title.textContent = 'Raffle not found';
    return;
  }

  document.getElementById('status').textContent = raffle.status;
  document.getElementById('title').textContent = raffle.title;
  document.getElementById('description').textContent = raffle.description || '';
  document.getElementById('meta').textContent =
    raffle.id + ' • ' + raffle.entries + ' entries • ' + raffle.winners + ' winners • ' + raffle.ends;

  const endsAt = raffle.endTime ? new Date(raffle.endTime).getTime() : 0;
  const countdown = document.createElement('p');
  countdown.className = 'meta';
  document.getElementById('meta').after(countdown);

  function tick() {
    if (!endsAt || raffle.status !== 'active') {
      countdown.textContent = 'Requirements: Verified role in Discord';
      return;
    }
    const left = endsAt - Date.now();
    if (left <= 0) {
      countdown.textContent = 'Ended • Requirements: Verified role in Discord';
      return;
    }
    const hours = Math.floor(left / 3600000);
    const minutes = Math.floor((left % 3600000) / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    countdown.textContent = 'Ends in ' + hours + 'h ' + minutes + 'm ' + seconds + 's • Verified role required';
  }
  tick();
  setInterval(tick, 1000);

  const enterBtn = document.getElementById('enter-btn');
  if (!enterBtn) return;
  if (raffle.status !== 'active') {
    enterBtn.style.display = 'none';
    document.getElementById('result').textContent = 'This raffle is not accepting entries.';
    return;
  }

  enterBtn.onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const discordId = document.getElementById('discord-id') ? document.getElementById('discord-id').value.trim() : '';
    const result = document.getElementById('result');
    result.textContent = 'Saving...';
    try {
      const response = await fetch('/api/raffles/' + raffle.id + '/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
  email,
  discordId,
  wallet: document.getElementById('wallet') ? document.getElementById('wallet').value.trim() : ''
})
      });
      const data = await response.json();
      result.textContent = response.ok
        ? data.message + ' Total entries: ' + data.entries
        : (data.error || 'Could not enter raffle.');
    } catch (error) {
      result.textContent = 'Could not connect to the raffle server.';
    }
  };
}

function setupMobileMenu() {
  const header = document.querySelector('header');
  const nav = document.querySelector('.nav');
  if (!header || !nav || document.querySelector('.menu-btn')) return;
  const button = document.createElement('button');
  button.className = 'menu-btn';
  button.type = 'button';
  button.textContent = 'Menu';
  button.onclick = () => nav.classList.toggle('open');
  header.insertBefore(button, nav);
}

async function updateAuthNav() {
  try {
    const me = await fetch('/api/me').then(r => r.json());
    document.querySelectorAll('a[href="/auth/discord"]').forEach(link => {
      if (me && me.username) {
        link.textContent = me.username;
        link.href = '/logout';
      }
    });
  } catch (error) {}
}

getRaffles()
  .then(raffles => {
    renderList(raffles);
    renderRafflePage(raffles);
  })
  .catch(() => {
    const list = document.getElementById('raffle-list');
    if (list) list.innerHTML = '<p class="meta">Could not load raffles. Start the website server.</p>';
  });

setupMobileMenu();
updateAuthNav();