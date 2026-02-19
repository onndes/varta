#!/bin/bash

# VARTA-2026 - Збірка в один файл
# Створює готовий файл index.html для передачі користувачам

echo "🛡️  VARTA-2026 - Збірка в один файл"
echo "===================================="
echo ""

# Перевірка Node.js
if ! command -v npm &> /dev/null; then
    echo "❌ npm не знайдено. Встановіть Node.js:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "📦 Збираю проєкт..."
echo ""

# Збірка
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ГОТОВО!"
    echo ""
    echo "📁 Файл для користувача:"
    echo "   dist/index.html (1.7 МБ)"
    echo ""
    echo "📄 Інструкція:"
    echo "   dist/ІНСТРУКЦІЯ.txt"
    echo ""
    echo "💡 Передайте користувачу ці файли"
    echo "   Він просто двічі клацне по index.html"
    echo ""
else
    echo ""
    echo "❌ Помилка збірки"
    echo "   Перевірте помилки вище"
    exit 1
fi
