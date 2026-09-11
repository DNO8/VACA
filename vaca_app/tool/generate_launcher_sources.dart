import 'dart:io';

import 'package:image/image.dart' as image;

void main() {
  _generate(
    'assets/images/icono-app-claro-v2.png',
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
    'assets/images/icono-app-claro-v2.png',
    'assets/images/launcher-source-adaptive.png',
    image.ColorRgba8(243, 247, 243, 255),
    460,
  );
  _generate(
    'assets/images/icono-app-oscuro-v2.webp',
    'assets/images/launcher-source-adaptive-dark.png',
    image.ColorRgba8(31, 59, 48, 255),
    460,
  );
  _generateAndroidNightResources();
  _generateAndroidSplashBlank();
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

void _generateAndroidNightResources() {
  final legacy = image.decodeImage(
    File('assets/images/launcher-source-dark.png').readAsBytesSync(),
  );
  final adaptive = image.decodeImage(
    File('assets/images/launcher-source-adaptive-dark.png').readAsBytesSync(),
  );
  if (legacy == null || adaptive == null) {
    throw StateError('Could not decode generated launcher sources');
  }
  const legacySizes = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
  };
  const adaptiveSizes = {
    'mdpi': 108,
    'hdpi': 162,
    'xhdpi': 216,
    'xxhdpi': 324,
    'xxxhdpi': 432,
  };
  for (final entry in legacySizes.entries) {
    _writeAndroidIcon(
      legacy,
      'mipmap-night-${entry.key}',
      'ic_launcher.png',
      entry.value,
    );
  }
  for (final entry in adaptiveSizes.entries) {
    _writeAndroidIcon(
      adaptive,
      'drawable-night-${entry.key}',
      'ic_launcher_foreground.png',
      entry.value,
    );
  }
  final colors = File('android/app/src/main/res/values-night/colors.xml');
  colors.writeAsStringSync(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources>\n'
    '    <color name="ic_launcher_background">#1F3B30</color>\n'
    '</resources>\n',
  );
}

void _generateAndroidSplashBlank() {
  final blank = image.Image(width: 432, height: 432, numChannels: 4);
  image.fill(blank, color: image.ColorRgba8(0, 0, 0, 255));
  File('android/app/src/main/res/drawable-nodpi/splash_blank.png')
      .writeAsBytesSync(image.encodePng(blank));
}

void _writeAndroidIcon(
  image.Image source,
  String directory,
  String filename,
  int size,
) {
  final output = Directory('android/app/src/main/res/$directory');
  output.createSync(recursive: true);
  final resized = image.copyResize(source, width: size, height: size);
  File('${output.path}/$filename').writeAsBytesSync(image.encodePng(resized));
}
