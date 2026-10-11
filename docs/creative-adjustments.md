# Creative adjustment prototypes

Two new editor sections follow **Color Mixer**. Both use native RawTherapee 5.13
PP3 settings, so quick/final previews and exports use the same adjustments.

## Color Grading

Independent shadow/highlight hue and saturation, balance, and strength. Starting
looks: **Teal & amber**, **Warm highlights**, and **Cool shadows**. Try a preset,
then keep saturation around 5–20 for subtle results. Use Balance to change the
shadow/highlight transition and Strength to soften the whole grade.

Reset grading restores neutral, disabled toning. The section toggle bypasses the
grade without discarding its settings. Global Edit strength scales the native
grading strength.

## Black & White

Enable **Monochrome**, choose a virtual color filter, and adjust Red, Green and
Blue brightness contributions. A red/orange filter is a good starting point for
dramatic skies; a green filter changes the separation of foliage and skin tones.
Reset mixer restores equal RGB contributions and no filter, retaining the current
monochrome toggle.

The mixer is relative: its RGB contributions are normalized by RawTherapee rather
than treated as independent exposure gains. Monochrome is a mode, so positive
global Edit strength retains monochrome; zero disables it. Combine it with Color
Grading for tinted black-and-white images.

Both sections participate in undo/redo, group bypass and PP3 snapshot serialization.
They start disabled and do not change existing photos when merely opening the editor.

## Validation

- Unit coverage: PP3 pair order, grading presets, unrelated-setting preservation,
  snapshot round trips with group bypass, integral grading strength, and zero strength.
- Actual deployed RawTherapee quick/final renders: three grading presets visibly
  change the image, monochrome output is grayscale, the red filter changes tonal
  values, half-strength grading is softer, and bypass/zero strength exactly match
  the neutral render.
- Chromium checks: preset preview requests, undo/redo, bypass, monochrome preview,
  save payload including both tools, and desktop/mobile mounting without runtime errors.
  Browser save writes were intercepted during the check.
