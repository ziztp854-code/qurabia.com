import styles from './control-icon.module.css';

type ControlIconName = 'labels' | 'overview' | 'zoom-out' | 'zoom-in' | 'settings' | 'build';

export function ControlIcon({ name }: { name: ControlIconName }) {
  return <span className={styles.icon} data-icon={name} aria-hidden="true" />;
}
