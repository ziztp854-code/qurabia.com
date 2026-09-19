const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.question.deleteMany({
      where: {
        prompt: {
          contains: 'في أي عام ولد لاون التاسع',
          mode: 'insensitive',
        },
      },
    });
    console.log('Deleted count:', result.count);
  } finally {
    await prisma.$disconnect();
  }
})();
