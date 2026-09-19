import { Award, Gamepad2, Gift, Medal, Sparkles, Trophy, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-header', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-content', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-footer', className)} {...props} />;
}

type CardArtwork = { src: string; alt: string };
type ShowcaseCardProps = {
  title: string;
  description?: string;
  meta?: string;
  icon?: ReactNode;
  artwork?: CardArtwork;
  className?: string;
  href?: string;
};

export function GameCard({ title, description, meta, icon = <Gamepad2 />, href }: ShowcaseCardProps) {
  const inner = (
    <>
      <span className="card-signal" aria-hidden="true" />
      <span className="card-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {meta && <Badge>{meta}</Badge>}
    </>
  );
  if (href) return <Link href={href} className="card showcase-card">{inner}</Link>;
  return <Card className="showcase-card">{inner}</Card>;
}

export function CompetitionCard({ title, description, meta, artwork, href }: ShowcaseCardProps) {
  const inner = (
    <>
      {artwork ? (
        <span className="competition-card-artwork">
          <Image src={artwork.src} alt={artwork.alt} fill sizes="(min-width: 900px) 30vw, 100vw" />
        </span>
      ) : (
        <>
          <span className="card-signal" aria-hidden="true" />
          <span className="card-icon"><Trophy /></span>
        </>
      )}
      <Badge className="badge-live">مباشر</Badge>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="card-meta"><Users size={16} />{meta}</span>
    </>
  );
  if (href) return <Link href={href} className="card showcase-card competition-card">{inner}</Link>;
  return <Card className="showcase-card competition-card">{inner}</Card>;
}

export function CategoryCard({ title, description, icon, href }: ShowcaseCardProps) {
  const inner = (
    <>
      <span className="category-emoji">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </>
  );
  if (href) return <Link href={href} className="card category-card">{inner}</Link>;
  return <Card className="category-card">{inner}</Card>;
}
export function PlayerCard({ title, description, meta }: ShowcaseCardProps) { return <Card className="showcase-card"><span className="card-icon"><Medal /></span><h3>{title}</h3><p>{description}</p><strong>{meta}</strong></Card>; }
export function AchievementCard({ title, description }: ShowcaseCardProps) { return <Card className="showcase-card"><span className="card-icon gold"><Award /></span><h3>{title}</h3><p>{description}</p></Card>; }
export function RewardCard({ title, description }: ShowcaseCardProps) { return <Card className="showcase-card"><span className="card-icon violet"><Gift /></span><h3>{title}</h3><p>{description}</p></Card>; }
export function StatisticCard({ title, meta, description }: ShowcaseCardProps) { return <Card className="stat-card"><span><Sparkles size={18} />{title}</span><strong>{meta}</strong><small>{description}</small></Card>; }
export const QuizCard = Card;
