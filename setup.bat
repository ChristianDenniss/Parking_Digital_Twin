@echo off
echo === UNBSJ Parking Digital Twin - First-time setup ===
echo.

echo [1/5] Installing dependencies...
cd BE && npm install && cd ..
cd FE && npm install && cd ..

echo.
echo [2/5] Copying environment files...
if not exist BE\.env (
    copy BE\.env.example BE\.env
    echo   Created BE\.env
) else (
    echo   BE\.env already exists, skipping
)
if not exist FE\.env (
    copy FE\.env.example FE\.env
    echo   Created FE\.env
) else (
    echo   FE\.env already exists, skipping
)

echo.
echo [3/5] Seeding database...
cd BE
npm run seed
npm run seed-courses
npm run populate-spots
npm run recalc-distances

echo.
echo [4/5] Generating historical data...
npm run gen-historical

echo.
echo [5/5] Importing Birmingham parking data + computing residuals...
npm run import-birmingham
npm run gen-residuals
npm run gen-event-residuals
cd ..

echo.
echo === Setup complete! ===
echo.
echo To start the app, run these in two separate terminals:
echo   Terminal 1:  cd BE  ^&^&  npm run dev
echo   Terminal 2:  cd FE  ^&^&  npm run dev
echo.
echo Then open http://localhost:5173
