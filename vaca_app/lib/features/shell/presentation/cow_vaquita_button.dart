import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme/app_theme.dart';

/// Botón Vaquita de la barra inferior: una vaca asomada en la esquina
/// derecha del nav. Deslizar a la izquierda la "saca" de su escondite y
/// abre la pestaña Vaquita. Tap simple también funciona. Mantener
/// apretado muestra la pista de gesto.
class CowVaquitaButton extends StatefulWidget {
  const CowVaquitaButton({
    required this.selected,
    required this.onPull,
    this.alert = false,
    this.onPullStart,
    this.onPullProgress,
    this.onPullEnd,
    super.key,
  });

  final bool selected;

  /// Hay una Vaquita disponible (propia promovida o ayuda pendiente):
  /// la vaca hace un "ring ring" sobre su centro para llamar la atención.
  final bool alert;
  final VoidCallback onPull;
  final VoidCallback? onPullStart;
  final ValueChanged<double>? onPullProgress;
  final ValueChanged<bool>? onPullEnd;

  @override
  State<CowVaquitaButton> createState() => _CowVaquitaButtonState();
}

class _CowVaquitaButtonState extends State<CowVaquitaButton>
    with TickerProviderStateMixin {
  static const double _cowSize = 44;
  static const double _hiddenPx = 27; // px ocultos tras el borde
  static const double _threshold = 0.4;

  late final AnimationController _hint;
  late final AnimationController _swing;
  late final Animation<double> _swingAngle;
  double _pull = 0; // 0 = escondida, 1 = completamente fuera
  double _accum = 0; // drag acumulado en px (negativo = izquierda)
  bool _hintVisible = false;

  // Oscilación de alerta: péndulo asimétrico +50° / -100° sobre el centro.
  static double _deg(double d) => d * math.pi / 180;

  @override
  void initState() {
    super.initState();
    _hint = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _swing = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );
    // "Ring ring" tipo teléfono: ráfaga de sacudidas ±10° en los primeros
    // ~600ms y pausa hasta reiniciar el ciclo. Reposo en 0°.
    _swingAngle = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween<double>(begin: 0.0, end: _deg(-10))
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 1,
      ),
      TweenSequenceItem(
        tween: Tween(begin: _deg(-10), end: _deg(10))
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 1.2,
      ),
      TweenSequenceItem(
        tween: Tween(begin: _deg(10), end: _deg(-8))
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 1,
      ),
      TweenSequenceItem(
        tween: Tween(begin: _deg(-8), end: _deg(8))
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 1,
      ),
      TweenSequenceItem(
        tween: Tween(begin: _deg(8), end: _deg(-5))
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 0.8,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: _deg(-5), end: 0.0)
            .chain(CurveTween(curve: Curves.easeIn)),
        weight: 0.8,
      ),
      // Pausa: el teléfono "descansa" entre ring y ring.
      TweenSequenceItem(tween: ConstantTween(0.0), weight: 8),
    ]).animate(_swing);
    if (widget.alert) _swing.repeat();
  }

  @override
  void didUpdateWidget(CowVaquitaButton old) {
    super.didUpdateWidget(old);
    // Al salir de la pestaña Vaquita, la vaca vuelve a su escondite.
    if (!widget.selected) _pull = 0;
    if (widget.alert != old.alert) {
      if (widget.alert) {
        _swing.repeat();
      } else {
        _swing.stop();
      }
    }
  }

  @override
  void dispose() {
    _hint.dispose();
    _swing.dispose();
    super.dispose();
  }

  void _showHint() {
    setState(() => _hintVisible = true);
    _hint.forward(from: 0);
    Future<void>.delayed(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _hintVisible = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    // La vaca sale según _pull (drag) o el wiggle de la pista.
    final wiggle = _hint.isAnimating
        ? Curves.elasticInOut.transform(_hint.value) * 0.5
        : 0.0;
    final reveal = widget.selected
        ? 1.0
        : (_pull > wiggle ? _pull : wiggle).clamp(0.0, 1.0);

    return Listener(
      behavior: HitTestBehavior.opaque,
      // Drag manual por pointer events: no depende de la arena de gestos.
      onPointerDown: (_) {
        _accum = 0;
        widget.onPullStart?.call();
      },
      onPointerMove: (e) {
        _accum += e.delta.dx;
        if (_accum.abs() > 3) {
          setState(() {
            _pull = (-_accum / _cowSize).clamp(0.0, 1.0);
          });
          widget.onPullProgress?.call(_pull);
        }
      },
      onPointerUp: (_) {
        if (_accum.abs() <= 3) return; // fue tap, lo toma GestureDetector
        final opened = _pull > _threshold || _accum < -24;
        setState(() => _pull = opened ? 1 : 0);
        if (opened) widget.onPull();
        widget.onPullEnd?.call(opened);
      },
      onPointerCancel: (_) {
        setState(() => _pull = 0);
        widget.onPullEnd?.call(false);
      },
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onPull,
        onLongPress: _showHint,
      child: SizedBox(
        width: 56,
        height: 64,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // La vaca entra desde la derecha: translate oculta→visible.
            Positioned.fill(
              child: ClipRect(
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Transform.translate(
                    offset: Offset((1 - reveal) * _hiddenPx, 0),
                    child: AnimatedBuilder(
                      animation: _swingAngle,
                      builder: (context, cow) => Transform.rotate(
                        angle: _swingAngle.value,
                        child: cow,
                      ),
                      child: SizedBox(
                        width: _cowSize,
                        height: _cowSize,
                        child: SvgPicture.asset(
                          'assets/images/vaca-svg.svg',
                          colorFilter: ColorFilter.mode(
                            widget.selected
                                ? AppColors.celadon300
                                : AppColors.white.withValues(alpha: 0.9),
                            BlendMode.srcIn,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (_hintVisible)
              Positioned(
                right: 6,
                top: -22,
                child: AnimatedOpacity(
                  opacity: _hintVisible ? 1 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.celadon900,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                      border: Border.all(
                        color: AppColors.celadon300.withValues(alpha: 0.4),
                      ),
                    ),
                    child: const Text(
                      'Desliza ←',
                      style: TextStyle(
                        fontSize: 10,
                        color: AppColors.white,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      ),
    );
  }
}
