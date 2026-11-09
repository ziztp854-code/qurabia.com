import { formatNumber } from '@/lib/utils';

export type ShareCardResult = { gameTitle: string; name: string; rank: number; score: number };

/** Create the image locally: no session identifiers or player data leave the device. */
export async function createResultShareCard(result: ShareCardResult): Promise<File> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');

  // Keep the artwork local and render player data as real text over it.
  const background = context.createRadialGradient(600, 260, 40, 600, 310, 720);
  background.addColorStop(0, '#142c46');
  background.addColorStop(0.6, '#091625');
  background.addColorStop(1, '#030b15');
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 630);

  // A restrained gold frame and curved ribbons echo Tahaddi's royal identity.
  context.shadowColor = 'rgba(249, 178, 47, 0.6)';
  context.shadowBlur = 20;
  context.strokeStyle = '#e6b551';
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(29, 29, 1142, 572, 24);
  context.stroke();
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(235, 190, 94, 0.48)';
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(40, 40, 1120, 550, 18);
  context.stroke();
  context.strokeStyle = 'rgba(60, 130, 180, 0.24)';
  for (let i = 0; i < 4; i++) {
    context.beginPath();
    context.moveTo(42, 160 + i * 34);
    context.bezierCurveTo(175, 10 + i * 25, 300, 60 + i * 20, 405, 42);
    context.stroke();
    context.beginPath();
    context.moveTo(1158, 470 - i * 34);
    context.bezierCurveTo(1025, 620 - i * 25, 900, 570 - i * 20, 795, 588);
    context.stroke();
  }
  context.strokeStyle = 'rgba(225, 174, 72, 0.6)';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(40, 410);
  context.bezierCurveTo(130, 430, 170, 535, 280, 560);
  context.stroke();
  context.beginPath();
  context.moveTo(1160, 245);
  context.bezierCurveTo(1070, 265, 1030, 370, 920, 395);
  context.stroke();

  // Crown emblem: a vector ornament, with no image fetch or canvas tainting.
  const gold = context.createLinearGradient(0, 50, 0, 150);
  gold.addColorStop(0, '#fff1b1');
  gold.addColorStop(0.45, '#edbd5b');
  gold.addColorStop(1, '#9d651d');
  context.fillStyle = gold;
  context.beginPath();
  context.moveTo(545, 78);
  context.lineTo(555, 124);
  context.lineTo(645, 124);
  context.lineTo(655, 78);
  context.lineTo(628, 97);
  context.lineTo(600, 59);
  context.lineTo(572, 97);
  context.closePath();
  context.fill();
  context.strokeStyle = '#f8df99';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#941e29';
  context.beginPath();
  context.arc(600, 100, 5, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f0cb78';
  context.textAlign = 'center';
  context.direction = 'rtl';
  context.font = '800 32px "Cairo Variable", Cairo, sans-serif';
  context.fillText('تحدّي', 600, 164, 450);

  context.fillStyle = '#ffffff';
  context.font = '800 54px "Cairo Variable", Cairo, sans-serif';
  context.fillText(result.gameTitle, 600, 245, 990);
  context.font = '700 42px "Cairo Variable", Cairo, sans-serif';
  context.fillText(result.name, 600, 316, 950);

  context.shadowColor = 'rgba(245, 182, 65, 0.55)';
  context.shadowBlur = 16;
  context.fillStyle = '#0d1b28';
  context.strokeStyle = '#e8b854';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(370, 348, 460, 94, 35);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  // Laurel branches frame the rank while leaving the result unobstructed.
  context.fillStyle = gold;
  for (const side of [-1, 1]) {
    context.save();
    context.translate(600 + side * 260, 397);
    context.scale(side, 1);
    context.strokeStyle = '#d3a64e';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, 48);
    context.bezierCurveTo(40, 25, 45, -15, 52, -42);
    context.stroke();
    for (let i = 0; i < 5; i++) {
      context.save();
      context.translate(14 + i * 9, 30 - i * 17);
      context.rotate(-0.7 + i * 0.1);
      context.beginPath();
      context.ellipse(0, 0, 7, 15, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.restore();
  }
  context.fillStyle = '#f5d58c';
  context.font = '800 52px "Cairo Variable", Cairo, sans-serif';
  context.fillText(`المركز ${formatNumber(result.rank)}`, 600, 412, 390);
  context.fillStyle = '#ffffff';
  context.font = '800 48px "Cairo Variable", Cairo, sans-serif';
  context.fillText(`${formatNumber(result.score)} نقطة`, 600, 506, 740);
  context.fillStyle = '#c2d1d7';
  context.font = '500 26px "Cairo Variable", Cairo, sans-serif';
  context.direction = 'ltr';
  context.fillText('qurabia.com', 600, 557, 500);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export unavailable');
  return new File([blob], 'tahaddi-result.png', { type: 'image/png' });
}
