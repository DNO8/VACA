import 'dart:io';

import 'package:image/image.dart' as image;

void main() {
  _generate(
    'assets/images/icono-app-claro-v2.webp',
    'assets/images/launcher-source-light.png',
    image.ColorRgba8(243, 247, 243, 255),
    540,
  );
  _generate(
    'assets/images/icono-app-oscuro-v2.webp',
    'assets/images/launcher-source-dark.png',
    image.ColorRgba8(31, 59, 48, 255),
    540,
  );
  _generate(
    'assets/images/icono-app-claro-v2.webp',
    'assets/images/launcher-source-adaptive.png',
    image.ColorRgba8(243, 247, 243, 255),
    460,
  );
}

void _generate(
  String input,
  String output,
  image.Color background,
  int contentWidth,
) {
  final source = image.decodeImage(File(input).readAsBytesSync());
  if (source == null) throw StateError('Could not decode $input');
  final canvas = image.Image(width: 640, height: 640, numChannels: 4);
  image.fill(canvas, color: background);
  final resized = image.copyResize(source, width: contentWidth);
  image.compositeImage(
    canvas,
    resized,
    dstX: (canvas.width - resized.width) ~/ 2,
    dstY: (canvas.height - resized.height) ~/ 2,
  );
  File(output).writeAsBytesSync(image.encodePng(canvas));
}
