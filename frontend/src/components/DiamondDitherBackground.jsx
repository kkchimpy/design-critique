import { useEffect, useRef } from 'react';
import './DiamondDitherBackground.css';

const MAX_CLICKS = 10;
const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec3 uColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform vec2 uClickPos[10];
uniform float uClickTimes[10];

out vec4 fragColor;

float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))
#define FBM_OCTAVES 5
#define FBM_LACUNARITY 1.25
#define FBM_GAIN 1.0
#define FBM_SCALE 4.0

float hash11(float n) {
  return fract(sin(n) * 43758.5453);
}

float vnoise(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);

  float n000 = hash11(dot(ip + vec3(0.0, 0.0, 0.0), vec3(1.0, 57.0, 113.0)));
  float n100 = hash11(dot(ip + vec3(1.0, 0.0, 0.0), vec3(1.0, 57.0, 113.0)));
  float n010 = hash11(dot(ip + vec3(0.0, 1.0, 0.0), vec3(1.0, 57.0, 113.0)));
  float n110 = hash11(dot(ip + vec3(1.0, 1.0, 0.0), vec3(1.0, 57.0, 113.0)));
  float n001 = hash11(dot(ip + vec3(0.0, 0.0, 1.0), vec3(1.0, 57.0, 113.0)));
  float n101 = hash11(dot(ip + vec3(1.0, 0.0, 1.0), vec3(1.0, 57.0, 113.0)));
  float n011 = hash11(dot(ip + vec3(0.0, 1.0, 1.0), vec3(1.0, 57.0, 113.0)));
  float n111 = hash11(dot(ip + vec3(1.0, 1.0, 1.0), vec3(1.0, 57.0, 113.0)));

  vec3 w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  float x00 = mix(n000, n100, w.x);
  float x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x);
  float x11 = mix(n011, n111, w.x);
  float y0 = mix(x00, x10, w.y);
  float y1 = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

float fbm2(vec2 uv, float t) {
  vec3 p = vec3(uv * FBM_SCALE, t);
  float amp = 1.0;
  float freq = 1.0;
  float sum = 1.0;

  for (int i = 0; i < FBM_OCTAVES; ++i) {
    sum += amp * vnoise(p * freq);
    freq *= FBM_LACUNARITY;
    amp *= FBM_GAIN;
  }

  return sum * 0.5 + 0.5;
}

float maskDiamond(vec2 p, float cov) {
  float r = sqrt(cov) * 0.564;
  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

void main() {
  float pixelSize = uPixelSize;
  vec2 fragCoord = gl_FragCoord.xy - uResolution * 0.5;
  float aspectRatio = uResolution.x / uResolution.y;
  vec2 pixelUV = fract(fragCoord / pixelSize);
  float cellPixelSize = 8.0 * pixelSize;
  vec2 cellId = floor(fragCoord / cellPixelSize);
  vec2 cellCoord = cellId * cellPixelSize;
  vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

  float feed = fbm2(uv, uTime * 0.05);
  feed = feed * 0.52 - 0.61;

  const float speed = 0.30;
  const float thickness = 0.10;
  const float dampT = 1.0;
  const float dampR = 10.0;

  for (int i = 0; i < 10; ++i) {
    vec2 pos = uClickPos[i];
    if (pos.x < 0.0) continue;

    vec2 cuv = ((pos - uResolution * 0.5 - cellPixelSize * 0.5) / uResolution) * vec2(aspectRatio, 1.0);
    float t = max(uTime - uClickTimes[i], 0.0);
    float r = distance(uv, cuv);
    float waveR = speed * t;
    float ring = exp(-pow((r - waveR) / thickness, 2.0));
    float atten = exp(-dampT * t) * exp(-dampR * r);
    feed = max(feed, ring * atten);
  }

  float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
  float bw = step(0.5, feed + bayer);
  float mask = maskDiamond(pixelUV, bw);
  float vignette = smoothstep(0.92, 0.24, length((gl_FragCoord.xy / uResolution) - 0.5));

  fragColor = vec4(uColor, mask * (0.4 + vignette * 1.22));
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Diamond shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Diamond shader link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

export default function DiamondDitherBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
    if (!gl) {
      canvas.dataset.webgl = 'unsupported';
      return undefined;
    }

    const program = createProgram(gl);
    if (!program) return undefined;

    const positionBuffer = gl.createBuffer();
    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    const locations = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      time: gl.getUniformLocation(program, 'uTime'),
      color: gl.getUniformLocation(program, 'uColor'),
      pixelSize: gl.getUniformLocation(program, 'uPixelSize'),
      clickPos: gl.getUniformLocation(program, 'uClickPos[0]'),
      clickTimes: gl.getUniformLocation(program, 'uClickTimes[0]'),
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(locations.color, 0, 0, 0);
    gl.uniform1f(locations.pixelSize, 5.0);

    const clickPositions = new Float32Array(MAX_CLICKS * 2).fill(-1);
    const clickTimes = new Float32Array(MAX_CLICKS);
    let clickIndex = 0;
    let start = performance.now();
    let frameId = 0;
    let width = 1;
    let height = 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(locations.resolution, width, height);
    };

    const draw = (now) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(locations.time, reducedMotion ? 0 : (now - start) * 0.001);
      gl.uniform2fv(locations.clickPos, clickPositions);
      gl.uniform1fv(locations.clickTimes, clickTimes);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!reducedMotion) {
        frameId = requestAnimationFrame(draw);
      }
    };

    const handlePointerDown = (event) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dprX = width / rect.width;
      const dprY = height / rect.height;
      clickPositions[clickIndex * 2] = (event.clientX - rect.left) * dprX;
      clickPositions[clickIndex * 2 + 1] = (rect.height - (event.clientY - rect.top)) * dprY;
      clickTimes[clickIndex] = reducedMotion ? 0 : (performance.now() - start) * 0.001;
      clickIndex = (clickIndex + 1) % MAX_CLICKS;
      if (reducedMotion) draw(performance.now());
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('resize', resize, { passive: true });

    resize();
    start = performance.now();
    draw(start);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div className="diamond-dither-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="diamond-dither-canvas" />
      <div className="diamond-dither-veil" />
    </div>
  );
}
