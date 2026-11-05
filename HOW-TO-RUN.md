# How to run the booth (no coding tools needed)

You only need a web browser and Node.js, a free program the booth runs on.

## One-time setup on a new computer

1. **Install Node.js.** Go to [nodejs.org](https://nodejs.org/), download the **LTS** version and run the installer. Keep clicking Next / Continue.
2. **Get the booth files.** On the [GitHub page](https://github.com/fizoccct-creator/Photo-career-transforamtion), click the green **Code** button, then **Download ZIP**. Unzip it somewhere easy to find, like the Desktop.
3. **Start the booth** (see below). The first start needs internet and takes about a minute.
4. **Add your API key.** The first time, the browser opens the **Booth setup** page:
   - Choose **OpenAI**.
   - Paste your key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
   - Click **🔌 Test key** to check it, then **💾 Save**.
   - Click **▶ Open the booth**.

The key is saved in a file called `.env` inside the booth folder, on that computer only. Players never see it.

## Start the booth (every time)

| Computer | Double-click this file in the booth folder |
|----------|--------------------------------------------|
| Windows  | `Start Booth (Windows).bat` |
| Mac      | `Start Booth (Mac).command` |

The browser opens the booth. Allow the camera when it asks.

A black (Windows) or Terminal (Mac) window also opens. **Keep it open** while the booth runs. Close it to stop the booth.

**First time on a Mac:** if it says the file "can't be opened", right-click the file and choose **Open**, then **Open** again. You only need to do this once.

**First time on Windows:** if a blue "Windows protected your PC" box appears, click **More info**, then **Run anyway**.

## Change the API key later

On the booth's home screen, click **⚙️ Setup** in the bottom-right corner. You can also open `http://localhost:3000/setup.html` in the browser.

Setup only works on the booth computer itself. Phones that scan the QR code can't open it.

## Problems

- **"The booth needs Node.js"**: install the LTS version from nodejs.org, then start the booth again.
- **The browser didn't open**: open `http://localhost:3000` yourself.
- **"OpenAI says this API key is wrong"**: copy the key again from platform.openai.com. Make sure you copy all of it.
- **Photos don't transform**: open ⚙️ Setup and click **Test key**. Check that your OpenAI account has billing set up.
