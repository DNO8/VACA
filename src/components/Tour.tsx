'use client';

import { Joyride, EVENTS, type EventData, type Options, type Step, type Styles } from 'react-joyride';

export type { Step };

// La versión instalada de react-joyride soporta floaterProps en runtime, pero sus tipos no lo incluyen.
const JoyrideAny = Joyride as any;

const options: Partial<Options> = {
  arrowColor: '#0C0E1A',
  backgroundColor: '#0C0E1A',
  primaryColor: '#D4AF37',
  textColor: '#E8E6E0',
  overlayColor: 'rgba(4, 4, 10, 0.78)',
  spotlightRadius: 12,
  spotlightPadding: 6,
  showProgress: true,
  skipBeacon: true,
  buttons: ['back', 'skip', 'primary'],
  zIndex: 10000,
};

const floaterProps = {
  disableAnimation: false,
  options: {
    placement: 'auto' as const,
    preventOverflow: { boundariesElement: 'window' as const },
  },
};

const styles: Partial<Styles> = {
  tooltip: {
    borderRadius: 14,
    border: '1px solid rgba(212, 175, 55, 0.4)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(212, 175, 55, 0.08)',
    padding: 18,
  },
  tooltipContainer: {
    textAlign: 'left',
  },
  tooltipTitle: {
    color: '#F5F0E0',
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 4,
  },
  tooltipContent: {
    padding: '8px 0',
    fontSize: 13,
    lineHeight: 1.6,
    color: '#9B978E',
  },
  buttonPrimary: {
    borderRadius: 8,
    fontWeight: 700,
    color: '#04040A',
    padding: '8px 16px',
    fontSize: 13,
  },
  buttonBack: {
    color: '#9B978E',
    fontSize: 13,
    marginRight: 8,
  },
  buttonSkip: {
    color: '#5C5A54',
    fontSize: 12,
  },
  spotlight: {
    rx: 12,
    ry: 12,
  },
};

const locale = {
  back: 'Atrás',
  close: 'Cerrar',
  last: 'Entendido',
  next: 'Siguiente',
  nextWithProgress: 'Siguiente ({current}/{total})',
  skip: 'Saltar tour',
};

interface TourProps {
  steps: Step[];
  run: boolean;
  onFinish: () => void;
}

export default function Tour({ steps, run, onFinish }: TourProps) {
  const handleEvent = (data: EventData) => {
    if (data.type === EVENTS.TOUR_END) {
      onFinish();
    }
  };

  return (
    <JoyrideAny
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      options={options}
      styles={styles}
      locale={locale}
      floaterProps={floaterProps}
    />
  );
}
