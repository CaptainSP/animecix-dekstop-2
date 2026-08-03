import { Menu, useMediaContext, useMediaState } from '@vidstack/react';
import { OdometerIcon } from '@vidstack/react/icons';
import {
  DefaultMenuButton,
  DefaultMenuSection,
  useDefaultLayoutContext,
  useDefaultLayoutWord,
} from '@vidstack/react/player/layouts/default';

type PlaybackRates = number[] | { min: number; max: number; step: number };

/**
 * Resolves the discrete selectable speeds from the layout playbackRates config.
 * Arrays are used verbatim; { min, max, step } ranges are expanded into a list.
 */
export function getSpeedOptions(rates: PlaybackRates): number[] {
  if (Array.isArray(rates)) return rates;
  const { min = 0, max = 2, step = 0.25 } = rates;
  const options: number[] = [];
  for (let rate = min; rate <= max + 1e-9; rate += step) {
    options.push(Math.round(rate * 100) / 100);
  }
  return options;
}

/**
 * Formats the playback rate for display ("1.5x"), rounding away float noise
 * (e.g. 1.7500000000000002 → "1.75x"). 1x is shown as "Normal".
 */
export function formatSpeedValue(playbackRate: number, normalWord: string): string {
  if (playbackRate === 1) return normalWord;
  const rounded = Math.round(playbackRate * 100) / 100;
  return `${rounded}x`;
}

/**
 * SpeedMenu -- "Hız" submenu with a discrete playback-rate radio list.
 *
 * WHY: A slider bound to the playbackRates range allowed arbitrary
 * intermediate values that made playback feel unstable. The user settled on
 * exactly the presets defined by the layout playbackRates prop; a radio group
 * bound to the media playbackRate keeps the checked option in sync.
 */
export function SpeedMenu() {
  const { remote } = useMediaContext();
  const { playbackRates, icons } = useDefaultLayoutContext();
  const canSetPlaybackRate = useMediaState('canSetPlaybackRate');
  const playbackRate = useMediaState('playbackRate');
  const speedWord = useDefaultLayoutWord('Speed');
  const normalWord = useDefaultLayoutWord('Normal');

  if (!canSetPlaybackRate) return null;

  const options = getSpeedOptions(playbackRates);
  const valueLabel = formatSpeedValue(playbackRate, normalWord);

  return (
    <Menu.Root className="vds-menu">
      <DefaultMenuButton label={speedWord} hint={valueLabel} Icon={OdometerIcon} />
      <Menu.Items className="vds-menu-items">
        <DefaultMenuSection label={speedWord} value={valueLabel}>
          <Menu.RadioGroup className="vds-radio-group" role="radiogroup" value={String(playbackRate)}>
            {options.map((rate) => (
              <Menu.Radio
                className="vds-radio"
                value={String(rate)}
                onSelect={() => remote.changePlaybackRate(rate)}
                key={rate}
              >
                <icons.Menu.RadioCheck className="vds-icon" />
                <span className="vds-radio-label">{formatSpeedValue(rate, normalWord)}</span>
              </Menu.Radio>
            ))}
          </Menu.RadioGroup>
        </DefaultMenuSection>
      </Menu.Items>
    </Menu.Root>
  );
}
