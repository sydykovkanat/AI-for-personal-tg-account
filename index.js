import dotenv from 'dotenv'
import fs from 'fs'
import OpenAI from 'openai'
import readline from 'readline'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

dotenv.config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Функция для чтения пользовательского ввода
function prompt (question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

const apiId = process.env.TELEGRAM_API_ID
const apiHash = process.env.TELEGRAM_API_HASH

// Загружаем строку сессии из файла
let stringSession
if (fs.existsSync('session.txt')) {
  const sessionString = fs.readFileSync('session.txt', 'utf-8')
  stringSession = new StringSession(sessionString)
} else {
  stringSession = new StringSession('')
}

const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
  connectionRetries: 5,
});

let myUserId = null;  // Для хранения вашего userId

(async () => {
  console.log('Запуск Telegram клиента...')
  await client.start({
    phoneNumber: async () => {
      return await prompt('Введите номер телефона: ')
    },
    password: async () => {
      return await prompt('Введите пароль (если включено 2FA): ')
    },
    phoneCode: async () => {
      return await prompt('Введите код из Telegram: ')
    },
    onError: (err) => console.log(err),
  })

  console.log('Клиент успешно запущен!')
  const sessionString = client.session.save()
  console.log('Сохраненная сессия: ', sessionString)

  // Сохраняем строку сессии в файл
  fs.writeFileSync('session.txt', sessionString)

  // Получаем свой userId после первого запуска
  myUserId = client.session.userId;

  // Логируем все события
  client.addEventHandler(async (event) => {
    if (event.className !== 'UpdateShortMessage') {
      return;
    }

    const message = event.message;
    console.log(event)

    const myId = await client.getMe();

    const userId = await event.userId?.value;
    if (!userId || event.out === true) {
      console.log('Не удалось получить userId');
      return;
    }

    // Проверка, что это не ваше сообщение
    if (userId === myUserId) {
      console.log('Это ваше сообщение, пропускаем...');
      return;
    }

    if (message && event.className === 'UpdateShortMessage') {
      console.log('Полученное сообщение: ', message);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: message }
        ]
      });

      // Получаем ответ от OpenAI
      const reply = completion.choices[0].message.content;
      console.log('Ответ от OpenAI: ', reply);

      // Отправляем ответ обратно в Telegram
      await client.sendMessage(userId, { message: reply });
    }
  });
})();