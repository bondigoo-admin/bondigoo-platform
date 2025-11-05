// webglBlur.js
export function applyWebGLBlur(canvas, blurRadius = 10) {
  const gl = canvas.getContext('webgl');
  if (!gl) {
    console.error('WebGL not supported');
    return canvas; // Fallback to original canvas
  }

  // Vertex shader
  const vsSource = `
    attribute vec2 aPosition;
    varying vec2 vTexCoord;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vTexCoord = (aPosition + 1.0) / 2.0;
    }
  `;

  // Fragment shader for Gaussian blur (horizontal pass)
  const fsSource = `
    precision mediump float;
    uniform sampler2D uSampler;
    uniform vec2 uResolution;
    uniform float uBlurRadius;
    varying vec2 vTexCoord;

    void main() {
      vec4 color = vec4(0.0);
      float total = 0.0;
      float offset = uBlurRadius / uResolution.x;

      for (float t = -uBlurRadius; t <= uBlurRadius; t += 1.0) {
        float percent = (t + uBlurRadius) / (2.0 * uBlurRadius);
        float weight = percent - percent * percent; // Simple parabolic weight
        color += texture2D(uSampler, vTexCoord + vec2(t * offset, 0.0)) * weight;
        total += weight;
      }

      gl_FragColor = color / total;
    }
  `;

  // Compile shaders
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vsSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    console.error('Vertex shader compile error:', gl.getShaderInfoLog(vertexShader));
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fsSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.error('Fragment shader compile error:', gl.getShaderInfoLog(fragmentShader));
  }

  // Create program
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  // Set up rectangle geometry
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  // Set uniforms
  const uSampler = gl.getUniformLocation(program, 'uSampler');
  const uResolution = gl.getUniformLocation(program, 'uResolution');
  const uBlurRadius = gl.getUniformLocation(program, 'uBlurRadius');

  gl.uniform1i(uSampler, 0);
  gl.uniform2f(uResolution, canvas.width, canvas.height);
  gl.uniform1f(uBlurRadius, blurRadius);

  // Create texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Render
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  return canvas;
}