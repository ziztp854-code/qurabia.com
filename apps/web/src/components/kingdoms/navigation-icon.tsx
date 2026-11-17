import styles from './navigation-icon.module.css';

export type NavigationIconName = 'overview' | 'reports' | 'army' | 'map' | 'village' | 'alliances';

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return <span className={styles.icon} data-icon={name} aria-hidden="true" />;
}
