(() => {
  'use strict';

  const canvas = document.querySelector('#scene');
  const ctx = canvas.getContext('2d');
  const unitSelect = document.querySelector('#angle-unit');
  const message = document.querySelector('#message');
  const state = { x: 3, y: 4, z: 12 };
  const camera = { yaw: -0.68, elevation: 0.69 };
  const drag = { kind: null, pointerId: null, x: 0, y: 0 };
  const modeDescriptions = {
    cartesian: 'Three perpendicular steps: x, then y, then z.',
    polar: 'Travel r and turn by θ in the xy-plane, then move vertically by z.',
    cylindrical: 'Move out by ρ, turn by φ around the z-axis, then set height z.',
    spherical: 'Travel r from the origin, with θ from +z and φ around the z-axis.'
  };
  const modeColors = { cartesian: '#df775d', polar: '#006c65', cylindrical: '#8771a8', spherical: '#5d88ad' };
  let activeMode = 'cartesian';
  const maxValue = 100000;
  let view = { width: 0, height: 0, dpr: 1, scale: 1, centerX: 0, centerY: 0, bound: 10 };

  const nearlyZero = value => Math.abs(value) < 1e-10 ? 0 : value;
  const format = (value, digits = 3) => {
    const clean = nearlyZero(value);
    return clean.toFixed(digits).replace(/\.?0+$/, '');
  };
  const angleFactor = () => unitSelect.value === 'deg' ? Math.PI / 180 : 1;
  const angleFromDisplay = value => value * angleFactor();
  const angleToDisplay = value => unitSelect.value === 'deg' ? value * 180 / Math.PI : value;
  const normalAngle = value => ((value % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function spherical() {
    const rho = Math.hypot(state.x, state.y);
    const r = Math.hypot(rho, state.z);
    return {
      r,
      theta: r < 1e-10 ? 0 : Math.acos(clamp(state.z / r, -1, 1)),
      phi: rho < 1e-10 ? 0 : normalAngle(Math.atan2(state.y, state.x)),
      rho,
      azimuth: rho < 1e-10 ? 0 : normalAngle(Math.atan2(state.y, state.x))
    };
  }

  function syncFields() {
    const s = spherical();
    const values = {
      cartesian: { x: state.x, y: state.y, z: state.z },
      polar: { r: s.rho, theta: angleToDisplay(s.azimuth), z: state.z },
      cylindrical: { rho: s.rho, phi: angleToDisplay(s.azimuth), z: state.z },
      spherical: { r: s.r, theta: angleToDisplay(s.theta), phi: angleToDisplay(s.phi) }
    };
    for (const [system, fields] of Object.entries(values)) {
      const form = document.querySelector(`[data-system="${system}"]`);
      for (const [name, value] of Object.entries(fields)) {
        const input = form.elements.namedItem(name);
        input.value = format(value);
        input.removeAttribute('aria-invalid');
      }
    }
    updateReadouts(s);
  }

  function displayAngle(radians) {
    return unitSelect.value === 'deg' ? `${format(radians * 180 / Math.PI)}°` : `${format(radians)} rad`;
  }

  function updateReadouts(s = spherical()) {
    const representations = {
      cartesian: { title: 'CARTESIAN VALUES', tuple: `(${format(state.x)}, ${format(state.y)}, ${format(state.z)})`, legend: 'x / y / z steps' },
      polar: { title: 'POLAR + HEIGHT', tuple: `(${format(s.rho)}, ${displayAngle(s.azimuth)}, ${format(state.z)})`, legend: 'r / θ / z' },
      cylindrical: { title: 'CYLINDRICAL VALUES', tuple: `(${format(s.rho)}, ${displayAngle(s.azimuth)}, ${format(state.z)})`, legend: 'ρ / φ / z' },
      spherical: { title: 'SPHERICAL VALUES', tuple: `(${format(s.r)}, ${displayAngle(s.theta)}, ${displayAngle(s.phi)})`, legend: 'r / θ / φ' }
    };
    const representation = representations[activeMode];
    document.querySelector('#point-readout').textContent = `(${format(state.x)}, ${format(state.y)}, ${format(state.z)})`;
    document.querySelector('#projection-readout').textContent = `(${format(state.x)}, ${format(state.y)}, 0)`;
    document.querySelector('#system-readout-label').textContent = representation.title;
    document.querySelector('#system-readout').textContent = representation.tuple;
    document.querySelector('#construction-label').textContent = representation.legend;
    document.querySelector('#construction-swatch').style.borderTopColor = modeColors[activeMode];
  }

  function setModeUI(mode) {
    if (!modeDescriptions[mode]) return;
    activeMode = mode;
    for (const button of document.querySelectorAll('.simulation-tabs button')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    document.querySelector('#mode-description').textContent = modeDescriptions[mode];
  }

  function selectMode(mode) {
    setModeUI(mode);
    updateReadouts();
    drawScene();
  }

  function currentView() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const extent = Math.max(Math.abs(state.x), Math.abs(state.y), Math.abs(state.z), 5);
    const bound = Math.max(7, extent * 1.25 + 2);
    const scale = Math.min(width, height) * 0.92 / (bound * 2);
    view = { width, height, dpr, scale, centerX: width * 0.52, centerY: height * 0.57, bound };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return view;
  }

  function project(point) {
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const se = Math.sin(camera.elevation), ce = Math.cos(camera.elevation);
    const right = cy * point.x + sy * point.y;
    const up = -sy * se * point.x + cy * se * point.y + ce * point.z;
    return { x: view.centerX + right * view.scale, y: view.centerY - up * view.scale };
  }

  function line(a, b, color, width = 1, dash = []) {
    const pa = project(a), pb = project(b);
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function dot(point, radius, fill, stroke = null) {
    const p = project(point);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function label(point, text, color = '#435650', offsetX = 7, offsetY = -7, font = '11px "DM Mono", monospace') {
    const p = project(point);
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, p.x + offsetX, p.y + offsetY);
  }

  function niceStep(bound) {
    const target = bound / 4;
    const power = 10 ** Math.floor(Math.log10(target));
    const fraction = target / power;
    return (fraction < 2 ? 1 : fraction < 4 ? 2 : fraction < 8 ? 5 : 10) * power;
  }

  function drawGrid() {
    const b = Math.ceil(view.bound / niceStep(view.bound)) * niceStep(view.bound);
    const step = niceStep(view.bound);
    const gridColor = 'rgba(100, 126, 116, .20)';
    for (let n = -b; n <= b + step / 2; n += step) {
      if (Math.abs(n) < step / 10) continue;
      line({ x: n, y: -b, z: 0 }, { x: n, y: b, z: 0 }, gridColor, .7);
      line({ x: -b, y: n, z: 0 }, { x: b, y: n, z: 0 }, gridColor, .7);
    }
    line({ x: -b, y: 0, z: 0 }, { x: b, y: 0, z: 0 }, '#df775d', 1.5);
    line({ x: 0, y: -b, z: 0 }, { x: 0, y: b, z: 0 }, '#006c65', 1.5);
    line({ x: 0, y: 0, z: -b }, { x: 0, y: 0, z: b }, '#5d88ad', 1.5);
    label({ x: b, y: 0, z: 0 }, 'x', '#bd624c', 7, -8);
    label({ x: 0, y: b, z: 0 }, 'y', '#006c65', 7, -8);
    label({ x: 0, y: 0, z: b }, 'z', '#4a7699', 7, -8);
    label({ x: 0, y: 0, z: -b }, '-z', '#4a7699', 7, 8);
    label({ x: 0, y: 0, z: 0 }, 'O', '#53645e', -15, 11);
  }

  function drawAngleArc(radius, end, pointFactory, color, text) {
    if (Math.abs(end) < 0.035 || !Number.isFinite(end)) return;
    ctx.beginPath();
    const samples = Math.max(12, Math.ceil(Math.abs(end) * 15));
    for (let i = 0; i <= samples; i++) {
      const t = end * i / samples;
      const q = project(pointFactory(t));
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const mid = project(pointFactory(end * .55));
    ctx.font = '10px "DM Mono", monospace';
    ctx.fillStyle = color;
    ctx.fillText(text, mid.x + 5, mid.y - 6);
  }

  function drawRing(radius, z, color, dash = []) {
    if (radius < 1e-8) return;
    const steps = 72;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * 2 * i / steps;
      const p = project({ x: radius * Math.cos(a), y: radius * Math.sin(a), z });
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCylinder(radius, z) {
    if (radius < 1e-8) return;
    const low = Math.min(0, z), high = Math.max(0, z);
    if (Math.abs(high - low) < 1e-8) {
      drawRing(radius, 0, 'rgba(135, 113, 168, .45)', [4, 4]);
      return;
    }
    const steps = 64;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * 2 * i / steps;
      const p = project({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: low });
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    for (let i = steps; i >= 0; i--) {
      const a = Math.PI * 2 * i / steps;
      const p = project({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: high });
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(135, 113, 168, .075)';
    ctx.fill();
    drawRing(radius, low, 'rgba(135, 113, 168, .5)', [4, 4]);
    drawRing(radius, high, 'rgba(135, 113, 168, .5)', [4, 4]);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      line({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: low },
        { x: radius * Math.cos(a), y: radius * Math.sin(a), z: high },
        'rgba(135, 113, 168, .38)', .8, [3, 4]);
    }
  }

  function drawConstruction(O, A, B, P, s) {
    const rho = s.rho;
    const phi = s.azimuth > Math.PI ? s.azimuth - 2 * Math.PI : s.azimuth;
    if (activeMode === 'cartesian') {
      line(O, A, '#df775d', 2.1);
      line(A, B, '#006c65', 2.1);
      line(B, P, '#5d88ad', 2.1);
      label({ x: state.x * .5, y: 0, z: 0 }, 'x', '#bd624c', 4, 9, '10px "SFMono-Regular", Consolas, monospace');
      label({ x: state.x, y: state.y * .5, z: 0 }, 'y', '#006c65', 5, -7, '10px "SFMono-Regular", Consolas, monospace');
      label({ x: state.x, y: state.y, z: state.z * .5 }, 'z', '#4a7699', 7, 0, '10px "SFMono-Regular", Consolas, monospace');
      dot(A, 2.5, '#df775d');
    } else if (activeMode === 'polar') {
      line(O, B, '#006c65', 2.5);
      line(B, P, '#5d88ad', 1.7, [5, 4]);
      const arcRadius = Math.min(rho * .48, view.bound * .27);
      drawAngleArc(arcRadius, phi,
        t => ({ x: arcRadius * Math.cos(t), y: arcRadius * Math.sin(t), z: 0 }), '#df775d', 'θ');
      label({ x: state.x * .5, y: state.y * .5, z: 0 }, 'r', '#006c65', 5, -7);
      label({ x: state.x, y: state.y, z: state.z * .5 }, 'z', '#4a7699', 7, 0);
    } else if (activeMode === 'cylindrical') {
      drawCylinder(rho, state.z);
      line(O, B, '#8771a8', 2.2);
      line(B, P, '#8771a8', 1.7, [5, 4]);
      const arcRadius = Math.min(rho * .48, view.bound * .27);
      drawAngleArc(arcRadius, phi,
        t => ({ x: arcRadius * Math.cos(t), y: arcRadius * Math.sin(t), z: 0 }), '#8771a8', 'φ');
      label({ x: state.x * .5, y: state.y * .5, z: 0 }, 'ρ', '#74608f', 5, -7);
      label({ x: state.x, y: state.y, z: state.z * .5 }, 'z', '#74608f', 7, 0);
    } else {
      line(O, B, 'rgba(0, 108, 101, .45)', 1.5, [4, 4]);
      line(B, P, '#5d88ad', 1.4, [4, 4]);
      const phiRadius = Math.min(rho * .48, view.bound * .27);
      drawAngleArc(phiRadius, phi,
        t => ({ x: phiRadius * Math.cos(t), y: phiRadius * Math.sin(t), z: 0 }), '#df775d', 'φ');
      const thetaRadius = Math.min(s.r * .34, view.bound * .22);
      drawAngleArc(thetaRadius, s.theta,
        t => ({ x: thetaRadius * Math.sin(t) * Math.cos(s.phi), y: thetaRadius * Math.sin(t) * Math.sin(s.phi), z: thetaRadius * Math.cos(t) }), '#5d88ad', 'θ');
      label({ x: state.x * .5, y: state.y * .5, z: state.z * .5 }, 'r', '#005650', 5, -7);
    }
  }

  function drawScene() {
    currentView();
    drawGrid();
    const O = { x: 0, y: 0, z: 0 };
    const A = { x: state.x, y: 0, z: 0 };
    const B = { x: state.x, y: state.y, z: 0 };
    const P = { x: state.x, y: state.y, z: state.z };
    const s = spherical();
    drawConstruction(O, A, B, P, s);
    line(O, P, '#243e39', 2.4);
    dot(B, 3, '#006c65');
    dot(P, 7, '#df775d', '#fffefa');
    label(B, 'Pxy', '#006c65', 7, 11, '9px "SFMono-Regular", Consolas, monospace');
    label(P, 'P', '#a94d3a', 11, -13, 'bold 12px "SFMono-Regular", Consolas, monospace');
  }

  function screenToXY(screenX, screenY, z) {
    const u = (screenX - view.centerX) / view.scale;
    const v = (view.centerY - screenY) / view.scale - Math.cos(camera.elevation) * z;
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), se = Math.sin(camera.elevation);
    return {
      x: cy * u - sy * v / se,
      y: sy * u + cy * v / se
    };
  }

  function applyPoint(next, source = 'Coordinates applied.', mode = null) {
    state.x = nearlyZero(next.x);
    state.y = nearlyZero(next.y);
    state.z = nearlyZero(next.z);
    if (mode) setModeUI(mode);
    syncFields();
    drawScene();
    showMessage(source);
  }

  function readInput(form, name, labelText) {
    const input = form.elements.namedItem(name);
    const raw = input.value.trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      input.setAttribute('aria-invalid', 'true');
      throw new Error(`${labelText} must be a finite number.`);
    }
    if (Math.abs(value) > maxValue) {
      input.setAttribute('aria-invalid', 'true');
      throw new Error(`${labelText} must be between -100,000 and 100,000 for this visualizer.`);
    }
    input.removeAttribute('aria-invalid');
    return value;
  }

  function readNonnegative(form, name, labelText) {
    const value = readInput(form, name, labelText);
    if (value < 0) {
      form.elements.namedItem(name).setAttribute('aria-invalid', 'true');
      throw new Error(`${labelText} must be zero or greater.`);
    }
    return value;
  }

  function submitCoordinates(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const system = form.dataset.system;
    for (const input of form.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    try {
      let x, y, z;
      if (system === 'cartesian') {
        x = readInput(form, 'x', 'x'); y = readInput(form, 'y', 'y'); z = readInput(form, 'z', 'z');
      } else if (system === 'polar') {
        const r = readNonnegative(form, 'r', 'Polar radius');
        const theta = angleFromDisplay(readInput(form, 'theta', 'Polar angle'));
        z = readInput(form, 'z', 'z'); x = r * Math.cos(theta); y = r * Math.sin(theta);
      } else if (system === 'cylindrical') {
        const rho = readNonnegative(form, 'rho', 'Cylindrical radius');
        const phi = angleFromDisplay(readInput(form, 'phi', 'Cylindrical azimuth'));
        z = readInput(form, 'z', 'z'); x = rho * Math.cos(phi); y = rho * Math.sin(phi);
      } else {
        const r = readNonnegative(form, 'r', 'Spherical radius');
        const thetaInput = readInput(form, 'theta', 'Spherical inclination');
        const theta = angleFromDisplay(thetaInput);
        const maximumTheta = unitSelect.value === 'deg' ? 180 : Math.PI;
        if (thetaInput < 0 || thetaInput > maximumTheta) {
          form.elements.namedItem('theta').setAttribute('aria-invalid', 'true');
          throw new Error(`Spherical θ must be between 0 and ${unitSelect.value === 'deg' ? '180°' : 'π radians'}.`);
        }
        const phi = angleFromDisplay(readInput(form, 'phi', 'Spherical azimuth'));
        x = r * Math.sin(theta) * Math.cos(phi);
        y = r * Math.sin(theta) * Math.sin(phi);
        z = r * Math.cos(theta);
      }
      if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > maxValue) {
        throw new Error('The converted point is outside the visualizer range of ±100,000 units.');
      }
      applyPoint({ x, y, z }, `Updated from ${system[0].toUpperCase()}${system.slice(1)} coordinates. All four systems are synchronized.`, system);
    } catch (error) {
      showMessage(error.message, true);
      const invalid = form.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
    }
  }

  for (const form of document.querySelectorAll('.coordinate-card')) form.addEventListener('submit', submitCoordinates);
  for (const button of document.querySelectorAll('.simulation-tabs button')) {
    button.addEventListener('click', () => selectMode(button.dataset.mode));
  }
  unitSelect.addEventListener('change', () => {
    syncFields();
    drawScene();
    showMessage(`Angle fields are now shown in ${unitSelect.value === 'deg' ? 'degrees' : 'radians'}.`);
  });

  function localPointer(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', event => {
    const p = localPointer(event);
    const point = project(state);
    const onPoint = Math.hypot(p.x - point.x, p.y - point.y) < 20;
    drag.kind = onPoint ? (event.shiftKey ? 'depth' : 'point') : 'orbit';
    drag.pointerId = event.pointerId;
    drag.x = p.x;
    drag.y = p.y;
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag.kind || event.pointerId !== drag.pointerId) return;
    const p = localPointer(event);
    const dx = p.x - drag.x, dy = p.y - drag.y;
    if (drag.kind === 'point') {
      const next = screenToXY(p.x, p.y, state.z);
      if (Math.max(Math.abs(next.x), Math.abs(next.y)) <= maxValue) {
        state.x = nearlyZero(next.x); state.y = nearlyZero(next.y);
        syncFields(); drawScene();
        showMessage('Point moved in the horizontal plane; z is held constant. All four systems are synchronized.');
      }
    } else if (drag.kind === 'depth') {
      const nextZ = state.z - dy / (view.scale * Math.cos(camera.elevation));
      if (Number.isFinite(nextZ) && Math.abs(nextZ) <= maxValue) {
        state.z = nearlyZero(nextZ);
        syncFields(); drawScene();
        showMessage('Point moved along the z-axis. It can pass below the xy-plane into negative z; all four systems are synchronized.');
      }
    } else {
      camera.yaw += dx * .009;
      camera.elevation = clamp(camera.elevation + dy * .008, .22, 1.38);
      drawScene();
    }
    drag.x = p.x; drag.y = p.y;
  });
  const finishDrag = event => {
    if (drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
    drag.kind = null; drag.pointerId = null;
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', finishDrag);

  canvas.addEventListener('keydown', event => {
    const step = event.altKey ? 1 : .25;
    let next = { x: state.x, y: state.y, z: state.z };
    if (event.key === 'ArrowLeft') next.x -= step;
    else if (event.key === 'ArrowRight') next.x += step;
    else if (event.key === 'ArrowUp' && event.shiftKey) next.z += step;
    else if (event.key === 'ArrowDown' && event.shiftKey) next.z -= step;
    else if (event.key === 'ArrowUp') next.y += step;
    else if (event.key === 'ArrowDown') next.y -= step;
    else return;
    event.preventDefault();
    applyPoint(next, 'Point moved with the keyboard. All four systems are synchronized.');
  });
  document.querySelector('#reset-view').addEventListener('click', () => {
    camera.yaw = -0.68; camera.elevation = .69; drawScene();
  });
  window.addEventListener('resize', drawScene);

  syncFields();
  drawScene();
})();
