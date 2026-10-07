/* Bench · easing.js
 * Robert Penner's easing equations plus a cubic-bezier solver, with the
 * GDScript / C# / CSS snippets a game developer would paste.
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = (2 * PI) / 3, c5 = (2 * PI) / 4.5;

  function bounceOut(x) {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }

  const fns = {
    linear: x => x,
    inSine: x => 1 - Math.cos((x * PI) / 2),
    outSine: x => Math.sin((x * PI) / 2),
    inOutSine: x => -(Math.cos(PI * x) - 1) / 2,
    inQuad: x => x * x,
    outQuad: x => 1 - (1 - x) * (1 - x),
    inOutQuad: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    inCubic: x => x * x * x,
    outCubic: x => 1 - Math.pow(1 - x, 3),
    inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inQuint: x => Math.pow(x, 5),
    outQuint: x => 1 - Math.pow(1 - x, 5),
    inOutQuint: x => (x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2),
    inExpo: x => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: x => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inOutExpo: x => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
    inBack: x => c3 * x * x * x - c1 * x * x,
    outBack: x => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
    inOutBack: x => (x < 0.5
      ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2),
    inElastic: x => (x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4)),
    outElastic: x => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1),
    inOutElastic: x => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5
      ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1),
    inBounce: x => 1 - bounceOut(1 - x),
    outBounce: bounceOut,
    inOutBounce: x => (x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2),
  };

  // Cubic bezier (CSS semantics) solved with Newton-Raphson + bisection.
  function bezier(x1, y1, x2, y2) {
    const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = a => 3 * a;
    const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
    const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-6) break;
        t -= (calc(t, x1, x2) - x) / s;
      }
      let lo = 0, hi = 1;
      t = Math.min(1, Math.max(0, t));
      for (let i = 0; i < 20 && Math.abs(calc(t, x1, x2) - x) > 1e-6; i++) {
        if (calc(t, x1, x2) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return calc(t, y1, y2);
    };
  }

  // Engine names for the selected curve.
  function snippets(name) {
    const m = name.match(/^(inOut|in|out)?([A-Z]\w*)$/);
    const kind = m && m[1] ? m[1] : 'in';
    const curve = m ? m[2] : 'Linear';
    const godotTrans = { Sine: 'SINE', Quad: 'QUAD', Cubic: 'CUBIC', Quint: 'QUINT', Expo: 'EXPO', Back: 'BACK', Elastic: 'ELASTIC', Bounce: 'BOUNCE' }[curve] || 'LINEAR';
    const godotEase = { in: 'EASE_IN', out: 'EASE_OUT', inOut: 'EASE_IN_OUT' }[kind];
    const dotween = name === 'linear' ? 'Linear' : `${{ in: 'In', out: 'Out', inOut: 'InOut' }[kind]}${curve}`;
    return {
      godot: name === 'linear'
        ? 'var tw := create_tween()\ntw.tween_property(self, "position", target, 0.4)'
        : `var tw := create_tween()\ntw.tween_property(self, "position", target, 0.4) \\\n\t.set_trans(Tween.TRANS_${godotTrans}).set_ease(Tween.${godotEase})`,
      unity: `transform.DOMove(target, 0.4f).SetEase(Ease.${dotween});`,
      css: `transition: transform 400ms ${cssApprox[name] || 'linear'};`,
    };
  }

  const cssApprox = {
    inSine: 'cubic-bezier(0.12, 0, 0.39, 0)', outSine: 'cubic-bezier(0.61, 1, 0.88, 1)', inOutSine: 'cubic-bezier(0.37, 0, 0.63, 1)',
    inQuad: 'cubic-bezier(0.11, 0, 0.5, 0)', outQuad: 'cubic-bezier(0.5, 1, 0.89, 1)', inOutQuad: 'cubic-bezier(0.45, 0, 0.55, 1)',
    inCubic: 'cubic-bezier(0.32, 0, 0.67, 0)', outCubic: 'cubic-bezier(0.33, 1, 0.68, 1)', inOutCubic: 'cubic-bezier(0.65, 0, 0.35, 1)',
    inQuint: 'cubic-bezier(0.64, 0, 0.78, 0)', outQuint: 'cubic-bezier(0.22, 1, 0.36, 1)', inOutQuint: 'cubic-bezier(0.83, 0, 0.17, 1)',
    inExpo: 'cubic-bezier(0.7, 0, 0.84, 0)', outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)', inOutExpo: 'cubic-bezier(0.87, 0, 0.13, 1)',
    inBack: 'cubic-bezier(0.36, 0, 0.66, -0.56)', outBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)', inOutBack: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  };

  const api = { fns, names: Object.keys(fns), bezier, snippets };
  root.Bench = root.Bench || {};
  root.Bench.easing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
