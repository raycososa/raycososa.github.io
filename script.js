document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fecha').textContent = new Date().toLocaleString('es-ES');

  const searchText = 'Sigrid';
  const targetUrl = 'https://www.gobiernodecanarias.org/educacion/6/dgper/opoperdocprimweb/scripts/publicaciones/apipublicaciones.asp?codtribunal=89&idpublicacion=31&tipo=resultado&tipotribunal=J&op=157&cuerpo=11&especialidad=72&idTipoPubPadre=0';

  function tryParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function extractObjectNear(text, pos) {
    let start = text.lastIndexOf('{', pos);
    if (start === -1) start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        const json = tryParseJSON(candidate);
        if (json) return json;
        break;
      }
    }
    return null;
  }

  function findObjectContainingText(data) {
    const regex = new RegExp(searchText, 'i');

    if (data && typeof data === 'object') {
      if (Array.isArray(data)) {
        for (const item of data) {
          const found = findObjectContainingText(item);
          if (found) return found;
        }
        return null;
      }

      for (const key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;

        const value = data[key];
        if (value && typeof value === 'object') {
          const found = findObjectContainingText(value);
          if (found) return found;
        } else if (regex.test(String(value)) || regex.test(key)) {
          return data;
        }
      }
    }

    return null;
  }

  async function fetchWithFallback(url) {
    const proxies = [
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
    ];

    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res && (res.status === 0 || (res.status >= 200 && res.status < 400))) {
        return { res, usedProxy: false };
      }
    } catch (e) {
      console.warn('Direct fetch falló, intentando proxies...', e);
    }

    for (const p of proxies) {
      const proxyUrl = p(url);
      try {
        const res = await fetch(proxyUrl);
        if (res && (res.status >= 200 && res.status < 400)) {
          return { res, usedProxy: true, proxyUrl };
        }
      } catch (e) {
        console.warn('Proxy falló:', proxyUrl, e);
      }
    }

    throw new Error('No se pudo obtener la URL, ni directo ni por proxy');
  }

  async function fetchAndAnalyze(url) {
    try {
      const { res, usedProxy, proxyUrl } = await fetchWithFallback(url);
      const ct = res.headers.get ? (res.headers.get('content-type') || '') : '';
      const text = await res.text();
      const found = new RegExp(searchText, 'i').test(text);

      const out = document.getElementById('sigrid-result');
      if (out) out.textContent = found + (usedProxy ? ' (proxy)' : '');

      if (usedProxy) {
        let proxyNotice = document.getElementById('sigrid-proxy-notice');
        if (!proxyNotice) {
          proxyNotice = document.createElement('div');
          proxyNotice.id = 'sigrid-proxy-notice';
          proxyNotice.className = 'proxy-notice';
          document.getElementById('sigrid-container').appendChild(proxyNotice);
        }
        proxyNotice.textContent = `Respuesta obtenida vía proxy: ${proxyUrl}`;
      }

      if (!found) {
        updateDetails(`No se encontró "${searchText}" en la respuesta.`);
        console.log(`${searchText} no encontrada`);
        return false;
      }

      let matchedObject = null;
      if (ct.includes('application/json')) {
        try {
          const json = JSON.parse(text);
          matchedObject = findObjectContainingText(json) || null;
        } catch (e) {
          // seguir con extracción de fragmento JSON
        }
      }

      if (!matchedObject) {
        const m = text.match(new RegExp(searchText, 'i'));
        const pos = m ? m.index : Math.floor(text.length / 2);
        matchedObject = extractObjectNear(text, pos);
      }

      if (matchedObject) {
        updateDetails(matchedObject);
        window.getSigridInfo = () => matchedObject;
        return true;
      }

      updateDetails(`Texto encontrado, pero no se pudo extraer un objeto JSON correspondiente para "${searchText}".`);
      window.getSigridInfo = () => null;
      return true;
    } catch (err) {
      console.error('Error fetching URL:', err);
      updateDetails('Error al obtener la URL (posible CORS o red).');
      const out = document.getElementById('sigrid-result');
      if (out) out.textContent = 'false (error)';
      return false;
    }
  }

  function updateDetails(data) {
    let details = document.getElementById('sigrid-details');
    if (!details) {
      details = document.createElement('pre');
      details.id = 'sigrid-details';
      details.className = 'result-details';
      const container = document.getElementById('sigrid-container');
      container.appendChild(details);
    }
    details.textContent = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  }

  const container = document.createElement('div');
  container.id = 'sigrid-container';
  container.className = 'result-container';
  container.innerHTML = `<h3>Comprobación de la URL</h3>
    <p>URL: <a href="${targetUrl}" target="_blank" rel="noopener">${targetUrl}</a></p>
    <p>Resultado: <strong id="sigrid-result">comprobando...</strong></p>
    <p><button id="recheck">Volver a comprobar</button></p>`;
  document.querySelector('main').appendChild(container);

  document.getElementById('recheck').addEventListener('click', () => {
    document.getElementById('sigrid-result').textContent = 'comprobando...';
    updateDetails('');
    fetchAndAnalyze(targetUrl);
  });

  fetchAndAnalyze(targetUrl);

  window.fetchAndAnalyze = fetchAndAnalyze;
  window.getSigridInfo = () => null;
});
