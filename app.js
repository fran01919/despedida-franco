(async function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Cargar config.json y mensajes.json ---------- */
  async function cargarJSON(ruta) {
    const r = await fetch(ruta, { cache: "no-cache" });
    if (!r.ok) throw new Error("No se pudo leer " + ruta);
    return r.json();
  }

  let config, mensajes;
  try {
    [config, mensajes] = await Promise.all([cargarJSON("config.json"), cargarJSON("mensajes.json")]);
  } catch (e) {
    const aviso = $("#error-carga");
    aviso.textContent =
      "No se pudieron cargar los mensajes. Si abriste el archivo con doble clic, prueba subiéndolo a GitHub Pages o abriéndolo con un servidor local.";
    aviso.hidden = false;
    $("#abrir").disabled = true;
    return;
  }

  const T = config.textos || {};
  const llenar = (texto, datos) => texto.replace(/\{(\w+)\}/g, (_, k) => datos[k]);

  /* ---------- Tema y textos desde config.json ---------- */
  Object.entries(config.tema || {}).forEach(([k, v]) => document.documentElement.style.setProperty("--" + k, v));

  if (T.tituloPagina) document.title = T.tituloPagina;
  const poner = (sel, texto) => { if (texto) $(sel).textContent = texto; };
  poner("#portada-l1", T.portadaLinea1);
  poner("#portada-l2", T.portadaLinea2);
  poner("#portada-texto", T.portadaTexto);
  poner("#portada-aviso", T.portadaAviso);
  poner("#abrir", T.portadaBoton);
  poner("#cabecera-titulo", T.cabeceraTitulo);
  poner("#cabecera-subtitulo", T.cabeceraSubtitulo);
  poner("#final-pie", T.finalPie);
  poner("#repetir", T.finalRepetir);
  poner("#volver", T.finalVolver);

  /* ---------- Lista de nombres ---------- */
  const total = mensajes.length;
  const leidos = new Set();
  const lista = $("#lista");
  const botones = [];

  mensajes.forEach((m, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nombre";
    b.dataset.i = i;
    b.setAttribute("aria-label", "Leer el mensaje de " + m.nombre);

    const nombre = document.createElement("span");
    nombre.textContent = m.nombre;
    b.appendChild(nombre);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "marca");
    svg.setAttribute("aria-hidden", "true");
    const uso = document.createElementNS(ns, "use");
    uso.setAttribute("href", "#estrella");
    svg.appendChild(uso);
    b.appendChild(svg);

    b.addEventListener("click", () => abrirMensaje(i));
    li.appendChild(b);
    lista.appendChild(li);
    botones.push(b);
  });

  /* ---------- Contador y desbloqueo del último saludo ---------- */
  const btnFinal = $("#btn-final");
  const pistaFinal = $("#pista-final");
  const requiereTodos = !config.final || config.final.desbloquearAlLeerTodos !== false;
  let desbloqueado = false;

  function actualizarEstado() {
    const plantilla = T.contador || "Leíste {leidos} de {total} mensajes";
    $("#contador").textContent = llenar(plantilla, { leidos: leidos.size, total });

    const listo = !requiereTodos || leidos.size >= total;
    btnFinal.disabled = !listo;
    btnFinal.textContent = T.finalBoton || "Toca aquí para el último saludo";

    if (listo) {
      pistaFinal.textContent = "";
      if (!desbloqueado && requiereTodos) btnFinal.classList.add("listo");
      desbloqueado = true;
    } else {
      const plantillaBloq = T.finalBloqueado || "Te faltan {faltan} mensajes para el último saludo";
      pistaFinal.textContent = llenar(plantillaBloq, { faltan: total - leidos.size });
    }
  }
  actualizarEstado();

  /* ---------- Ventana del mensaje ---------- */
  const dlg = $("#mensaje");
  let actual = 0;

  function mostrar(i) {
    actual = (i + total) % total;
    const m = mensajes[actual];
    $("#mensaje-texto").textContent = m.mensaje;
    $("#mensaje-firma").textContent = m.nombre;
    dlg.querySelector(".cuerpo").scrollTop = 0;

    leidos.add(actual);
    botones[actual].classList.add("leido");
    botones[actual].setAttribute("aria-label", "Mensaje de " + m.nombre + " (leído)");
    actualizarEstado();
  }

  function abrirMensaje(i) {
    mostrar(i);
    if (!dlg.open) {
      dlg.showModal();
      document.body.classList.add("bloqueado");
    }
  }

  $("#cerrar").addEventListener("click", () => dlg.close());
  $("#anterior").addEventListener("click", () => mostrar(actual - 1));
  $("#siguiente").addEventListener("click", () => mostrar(actual + 1));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => document.body.classList.remove("bloqueado"));
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") mostrar(actual - 1);
    if (e.key === "ArrowRight") mostrar(actual + 1);
  });

  /* ---------- Música de fondo (las canciones suenan en bucle, una tras otra) ---------- */
  const cfgMusica = config.musica || {};
  const canciones = cfgMusica.canciones || [];
  const volumenMusica = typeof cfgMusica.volumen === "number" ? cfgMusica.volumen : 0.5;
  const musica = new Audio();
  musica.preload = "auto";
  musica.volume = volumenMusica;
  let indiceCancion = 0;
  let fallos = 0;

  function cargarCancion(i) {
    indiceCancion = i % canciones.length;
    musica.src = canciones[indiceCancion];
  }
  function siguienteCancion() {
    cargarCancion(indiceCancion + 1);
    musica.play().catch(() => {});
  }
  if (canciones.length) {
    cargarCancion(0);
    musica.addEventListener("playing", () => { fallos = 0; });
    musica.addEventListener("ended", siguienteCancion);
    musica.addEventListener("error", () => {
      fallos += 1;
      if (fallos < canciones.length) siguienteCancion(); // salta canciones que no existan
    });
  }

  function fundir(audio, hasta, ms) {
    return new Promise((resolver) => {
      const desde = audio.volume;
      const inicio = performance.now();
      (function paso(ahora) {
        const t = Math.min((ahora - inicio) / ms, 1);
        audio.volume = Math.max(0, Math.min(1, desde + (hasta - desde) * t));
        if (t < 1) requestAnimationFrame(paso); else resolver();
      })(inicio);
    });
  }

  const btnSonido = $("#sonido");
  btnSonido.addEventListener("click", () => {
    musica.muted = !musica.muted;
    btnSonido.setAttribute("aria-pressed", String(musica.muted));
    btnSonido.setAttribute("aria-label", musica.muted ? "Activar música" : "Silenciar música");
  });

  /* ---------- Lluvia de banderas y logos ---------- */
  function probarImagen(item) {
    return new Promise((resolver) => {
      const img = new Image();
      img.onload = () => resolver(item);
      img.onerror = () => resolver(null); // si falta el archivo, se omite
      img.src = item.src;
    });
  }

  async function iniciarLluvia() {
    if (reducirMovimiento) return;
    const cfg = config.lluvia || {};
    const disponibles = (await Promise.all((cfg.imagenes || []).map(probarImagen))).filter(Boolean);
    if (!disponibles.length) return;

    const movil = window.matchMedia("(max-width: 600px)").matches;
    const cantidad = Math.round((cfg.cantidad || 20) * (movil ? 0.65 : 1));
    const aleatorio = (min, max) => min + Math.random() * (max - min);
    const contenedor = $("#lluvia");

    for (let i = 0; i < cantidad; i++) {
      const item = disponibles[i % disponibles.length];
      const img = new Image();
      img.alt = "";
      img.src = item.src;
      img.className = "gota" + (item.ficha ? " ficha" : "");

      const reubicar = () => {
        img.style.setProperty("--x", aleatorio(0, 94).toFixed(1) + "%");
        img.style.setProperty("--sway", aleatorio(-60, 60).toFixed(0) + "px");
      };
      const ancho = (item.ancho || 56) * aleatorio(0.8, 1.2) * (movil ? 0.8 : 1);
      const duracion = aleatorio(8, 15);
      img.style.setProperty("--w", ancho.toFixed(0) + "px");
      img.style.setProperty("--dur", duracion.toFixed(1) + "s");
      img.style.setProperty("--delay", (-aleatorio(0, duracion)).toFixed(1) + "s");
      img.style.setProperty("--rot", aleatorio(-35, 35).toFixed(0) + "deg");
      reubicar();
      img.addEventListener("animationiteration", reubicar);
      contenedor.appendChild(img);
    }
  }

  /* ---------- Portada: abrir la tarjeta ---------- */
  const portada = $("#portada");
  $("#abrir").addEventListener("click", () => {
    if (canciones.length) musica.play().catch(() => {});
    portada.classList.add("enciende");
    portada.querySelector(".estrella.cuarta").classList.add("encendida");

    setTimeout(() => {
      $("#tarjeta").hidden = false;
      if (canciones.length) btnSonido.hidden = false;
      portada.classList.add("sale");
      iniciarLluvia();
      $("#abrir").blur();
    }, reducirMovimiento ? 0 : 1000);

    setTimeout(() => { portada.hidden = true; }, reducirMovimiento ? 0 : 1900);
  });

  /* ---------- Último saludo: foto y audio ---------- */
  const cfgFinal = config.final || {};
  const saludo = new Audio();
  saludo.preload = "auto";
  if (cfgFinal.audio) saludo.src = cfgFinal.audio;

  const pantallaFinal = $("#final");
  const ecualizador = $("#ecualizador");
  const polaroid = $("#polaroid");
  const foto = $("#foto");

  if (cfgFinal.foto) {
    foto.addEventListener("error", () => polaroid.classList.add("sin-foto"));
    foto.src = cfgFinal.foto;
  } else {
    polaroid.classList.add("sin-foto");
  }

  saludo.addEventListener("playing", () => ecualizador.classList.add("suena"));
  saludo.addEventListener("pause", () => ecualizador.classList.remove("suena"));
  saludo.addEventListener("ended", () => ecualizador.classList.remove("suena"));

  async function abrirFinal() {
    pantallaFinal.hidden = false;
    document.body.classList.add("bloqueado");
    $("#repetir").focus({ preventScroll: true });

    if (canciones.length && !musica.paused) {
      await fundir(musica, 0, 1200); // baja la música antes del saludo
      musica.pause();
    }
    saludo.currentTime = 0;
    saludo.play().catch(() => {});
  }

  async function cerrarFinal() {
    saludo.pause();
    pantallaFinal.hidden = true;
    document.body.classList.remove("bloqueado");
    if (canciones.length) {
      musica.volume = 0;
      musica.play().catch(() => {});
      await fundir(musica, volumenMusica, 1500); // vuelve la música
    }
  }

  btnFinal.addEventListener("click", abrirFinal);
  $("#repetir").addEventListener("click", () => { saludo.currentTime = 0; saludo.play().catch(() => {}); });
  $("#volver").addEventListener("click", cerrarFinal);
})();
