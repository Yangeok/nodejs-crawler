git remote set-url origin <GIT_REPO_URL> && git pull origin master && git pull origin --tags && yarn

VER=`git describe --abbrev=0 --tags | sed 's/* //'`

echo ""
echo ""
echo "> current version: $VER"
echo ""