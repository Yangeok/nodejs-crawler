echo ""
echo "> kill previous process..."
echo ""
pm2 kill

echo ""
echo "> restart new process..."
echo "" 
yarn start:bat

echo ""
echo "> run pm2 logs"
echo ""
pm2 log