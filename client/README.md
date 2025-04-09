# AirShare - P2P File Sharing App

A modern peer-to-peer file sharing application built with cutting-edge web technologies. Share files directly between browsers with no server storage, powered by WebTorrent.

## ✨ Features

- 🔄 Peer-to-peer file sharing using WebTorrent
- 📱 Responsive design for desktop and mobile
- 🎯 Zero server storage - files transfer directly between peers
- 🔒 Secure file transfer with end-to-end encryption
- 🎨 Modern UI with dark/light mode support
- ⚡ Real-time transfer progress and speed indicators

## 🛠️ Technologies

- Next.js 14
- React 18
- TypeScript
- WebTorrent
- TailwindCSS
- shadcn/ui

## 🚀 Quick Start

### Prerequisites

- Node.js 22 or higher
- Git

### Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone https://github.com/TopNotchCo/file-sharing-app.git
   cd file-sharing-app
   ```

2. **Install Homebrew**
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. **Install Node Version Manager (NVM)**
   ```bash
   brew install nvm
   ```
   
   Add NVM to your shell profile:
   ```bash
   echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
   echo '[ -s "$(brew --prefix)/opt/nvm/nvm.sh" ] && . "$(brew --prefix)/opt/nvm/nvm.sh"' >> ~/.zshrc
   echo '[ -s "$(brew --prefix)/opt/nvm/etc/bash_completion.d/nvm" ] && . "$(brew --prefix)/opt/nvm/etc/bash_completion.d/nvm"' >> ~/.zshrc
   ```
   
   Reload your profile:
   ```bash
   source ~/.zshrc
   ```

4. **Install Node.js**
   ```bash
   nvm install 22
   nvm use 22
   ```

5. **Install Dependencies**
   ```bash
   npm install
   ```

6. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   The application will be available at [http://localhost:3000](http://localhost:3000)

## 📋 Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run start` - Run the production build
- `npm run lint` - Run linting

## 🔧 Environment Variables

Create a `.env.local` file in the root directory:

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional Analytics
NEXT_PUBLIC_ANALYTICS_ID=your_analytics_id
```

## 📁 Project Structure

```
.
├── app/                # Next.js app directory
├── components/         # React components
├── hooks/             # Custom React hooks
├── lib/               # Utility functions and libraries
└── public/            # Static assets
```

## 🌐 Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

## 🤝 Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## ❓ Troubleshooting

### Common Issues

1. **WebRTC Connection Issues**
   - Ensure you're using a supported browser
   - Check if your firewall is blocking WebRTC connections
   - Try using a different network

2. **Peer Discovery Problems**
   - Verify that you have a stable internet connection
   - Try refreshing the page
   - Check if your network allows P2P connections

### Error Messages

If you encounter any errors, please check the browser console and refer to our [issue tracker](https://github.com/TopNotchCo/file-sharing-app/issues).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📧 Support

For support, please open an issue in the GitHub repository or contact the maintainers at support@topnotch.co.
