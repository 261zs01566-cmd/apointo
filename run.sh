set -e
# コンテナ起動時に、データベースの表を作成・更新してからサーバを起動する
npx prisma db push --skip-generate
npx prisma generate
node index.js
