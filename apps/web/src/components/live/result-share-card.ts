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

  // The artwork stays on our own origin so it can be exported without tainting the canvas.
  const background = new Image();
  background.src = '/game-art/results/royal-result-background.webp';
  await background.decode();
  context.drawImage(background, 0, 0, canvas.width, canvas.height);

  context.textAlign = 'center';
  context.direction = 'rtl';
  context.shadowColor = 'rgba(0, 0, 0, 0.8)';
  context.shadowBlur = 7;
  context.fillStyle = '#f3cf80';
  context.font = '800 32px "Cairo Variable", Cairo, sans-serif';
  context.fillText('تحدّي', 600, 166, 450);
  context.fillStyle = '#ffffff';
  context.font = '800 54px "Cairo Variable", Cairo, sans-serif';
  context.fillText(result.gameTitle, 600, 242, 960);
  context.font = '700 42px "Cairo Variable", Cairo, sans-serif';
  context.fillText(result.name, 600, 310, 900);

  context.shadowColor = 'rgba(245, 182, 65, 0.7)';
  context.shadowBlur = 15;
  context.fillStyle = '#0a1725';
  context.strokeStyle = '#e8b854';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(370, 345, 460, 91, 32);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = '#f9df9c';
  context.font = '800 52px "Cairo Variable", Cairo, sans-serif';
  context.fillText(`المركز ${formatNumber(result.rank)}`, 600, 407, 390);
  context.fillStyle = '#ffffff';
  context.font = '800 47px "Cairo Variable", Cairo, sans-serif';
  context.fillText(`${formatNumber(result.score)} نقطة`, 600, 494, 740);
  context.fillStyle = '#d2dfe4';
  context.font = '600 26px "Cairo Variable", Cairo, sans-serif';
  context.direction = 'ltr';
  context.fillText('qurabia.com', 600, 547, 500);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export unavailable');
  return new File([blob], 'tahaddi-result.png', { type: 'image/png' });
}
