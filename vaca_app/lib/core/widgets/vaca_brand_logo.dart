import 'package:flutter/material.dart';

class VacaBrandLogo extends StatelessWidget {
  const VacaBrandLogo({
    required this.size,
    this.animateRouteTransition = true,
    super.key,
  });

  static const heroTag = 'vaca-brand-logo';

  final double size;
  final bool animateRouteTransition;

  @override
  Widget build(BuildContext context) {
    final asset = Theme.of(context).brightness == Brightness.dark
        ? 'assets/images/icono-app-oscuro-v2.webp'
        : 'assets/images/icono-app-claro-v2.png';
    final logo = Semantics(
      image: true,
      label: 'Logo VACA',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.22),
        child: Image.asset(
          asset,
          width: size,
          height: size,
          fit: BoxFit.cover,
        ),
      ),
    );
    if (!animateRouteTransition) return logo;
    return Hero(
      tag: heroTag,
      createRectTween: (begin, end) => MaterialRectCenterArcTween(
        begin: begin,
        end: end,
      ),
      flightShuttleBuilder: (
        flightContext,
        animation,
        direction,
        fromContext,
        toContext,
      ) {
        final destination = direction == HeroFlightDirection.push
            ? (toContext.widget as Hero).child
            : (fromContext.widget as Hero).child;
        return FadeTransition(opacity: animation, child: destination);
      },
      child: logo,
    );
  }
}
