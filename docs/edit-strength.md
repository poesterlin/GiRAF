# Edit strength prototype

The Edit strength slider (0–100%, default 100%) interpolates supported PP3
adjustments toward neutral before rendering. There is no image blending.
Crop, rotation, flips, spot removal, and other geometry remain fully applied.

## Math

- Exposure stops, brightness, contrast, saturation, black offset, highlight/shadow
  compression, shadows/highlights amounts, vibrance, clarity amount, dehaze,
  vignette strength, LUT strength, and sharpening amount: `effective = strength × original`.
- Type-1 diagonal tone curves: preserve input coordinates and interpolate output
  toward the diagonal: `y' = x + strength × (y − x)`.
  Curves whose endpoints are inside the input range are sampled across 0–1 first,
  including their constant tails, so the entire curve approaches identity.
- Editor HSV flat curves: interpolate control-point values toward `0.5`, preserving
  hue coordinates and tangent handles.
- Channel calibration: interpolate toward the identity matrix (diagonal 1000 for
  modern profiles, 100 for profiles before version 338), rounded to integers.
- Custom white balance: interpolate reciprocal Kelvin toward the image's imported
  temperature, and interpolate tint in log space toward its imported multiplier.
- Preserve shape controls: radii, thresholds, vignette feather/roundness, skin
  protection, etc. Scale the corresponding amount instead.
- Round scaled integer PP3 fields (brightness, contrast, saturation, black,
  compression, vibrance, shadows/highlights, dehaze, LUT, sharpening) before
  rendering; retain fractional exposure stops, local contrast and vignette.
- At zero, bypass supported adjustment tools, disable auto exposure, use Camera
  white balance, and reset exposure curves to identity. Retouching stays enabled.

## Integration

Original PP3 controls remain unchanged. Apply section bypasses first, then strength.
The effective PP3 feeds the existing throttled preview pipeline. LUT candidates use
the same strength math. Snapshot metadata stores `editStrength` and remembered
original settings; the ordinary PP3 body contains the effective settings. Existing
server render/export paths therefore render the saved strength without applying it
twice. Reload restores original controls and strength; older snapshots default to
100%. Strength participates in dirty-state detection and undo/redo.

## Prototype limits

Parameter interpolation is not perceptually uniform: tools interact nonlinearly.
Auto exposure remains automatic between 1% and 99%; it cannot be smoothly scaled
without resolving its computed values first. Named white-balance presets and custom
white balance without available import metadata remain unchanged at intermediate
strengths. Non-type-1 tone curves, non-editor HSV curve formats, and other imported
tools are preserved at intermediate strengths. This prototype covers the current
editor controls, rather than every possible RawTherapee PP3 tool.
