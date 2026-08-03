import { useMediaContext, useMediaState } from '@vidstack/react';
import {
  DefaultMenuCheckbox,
  DefaultMenuItem,
  useDefaultLayoutContext,
  useDefaultLayoutWord,
} from '@vidstack/react/player/layouts/default';

/**
 * Flat checkbox items injected at the TOP LEVEL of the settings menu
 * (settingsMenuItemsStart slot). The default layout nests these inside the
 * "Playback" and "Accessibility" submenus; the flat menu exposes them directly.
 *
 * WHY: DefaultPlaybackMenu / DefaultAccessibilityMenu are hidden via CSS
 * (EmbedPlayer.css) and recreated here as flat items.
 */

/**
 * Loop toggle — persisted to localStorage under "vds-player::user-loop",
 * mirroring the default DefaultLoopMenuCheckbox behaviour.
 */
function LoopCheckbox() {
  const { remote } = useMediaContext();
  const label = useDefaultLayoutWord('Loop');

  const onChange = (checked: boolean, trigger?: Event) => {
    remote.userPrefersLoopChange(checked, trigger);
  };

  return (
    <DefaultMenuItem label={label}>
      <DefaultMenuCheckbox label={label} storageKey="vds-player::user-loop" onChange={onChange} />
    </DefaultMenuItem>
  );
}

/**
 * Announcements toggle — announces media events to screen readers.
 * Persisted under "vds-player::announcements" (default: on).
 */
function AnnouncementsCheckbox() {
  const { userPrefersAnnouncements } = useDefaultLayoutContext();
  const label = useDefaultLayoutWord('Announcements');

  const onChange = (checked: boolean) => {
    userPrefersAnnouncements.set(checked);
  };

  return (
    <DefaultMenuItem label={label}>
      <DefaultMenuCheckbox
        label={label}
        defaultChecked
        storageKey="vds-player::announcements"
        onChange={onChange}
      />
    </DefaultMenuItem>
  );
}

/**
 * Keyboard Animations toggle — visual feedback for keyboard shortcuts.
 * Persisted under "vds-player::keyboard-animations" (default: on).
 * Hidden for non-video view types, mirroring the default layout behaviour.
 */
function KeyboardAnimationsCheckbox() {
  const viewType = useMediaState('viewType');
  const { userPrefersKeyboardAnimations, noKeyboardAnimations } = useDefaultLayoutContext();
  const label = useDefaultLayoutWord('Keyboard Animations');

  if (viewType !== 'video' || noKeyboardAnimations) return null;

  const onChange = (checked: boolean) => {
    userPrefersKeyboardAnimations.set(checked);
  };

  return (
    <DefaultMenuItem label={label}>
      <DefaultMenuCheckbox
        label={label}
        defaultChecked
        storageKey="vds-player::keyboard-animations"
        onChange={onChange}
      />
    </DefaultMenuItem>
  );
}

/**
 * All flat checkbox items — rendered together in the settings menu start slot.
 */
export function FlatSettingsMenu() {
  return (
    <>
      <LoopCheckbox />
      <AnnouncementsCheckbox />
      <KeyboardAnimationsCheckbox />
    </>
  );
}
