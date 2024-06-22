import { Button, Frog } from 'frog'
import { devtools } from 'frog/dev'
import dappykit from '@dappykit/sdk'
import { serveStatic } from 'frog/serve-static'
import { configureApp } from './utils/frame.js'
import { BORDER_SIMPLE, Box, Heading, Text, vars, VStack } from './utils/style.js'
import { handle } from 'frog/vercel'
import { kvGetDelegatedAddress, kvPutMnemonic } from './utils/kv.js'
import { dappySaveData } from './utils/dappykit.js'

const { ViemUtils, Utils } = dappykit
const { generateMnemonic, privateKeyToAccount, english, mnemonicToAccount } = ViemUtils
const { accountToSigner } = Utils.Signer

export const app = new Frog({
  assetsPath: '/',
  basePath: '/api',
  ui: { vars },
})

app.frame('/', async c => {
  const { appTitle } = await configureApp(app, c, 'appAuthUrl')

  const intents = [<Button action="/next">🔥 TOP</Button>]

  return c.res({
    title: appTitle,
    image: (
      <Box grow alignVertical="center" backgroundColor="white" padding="32" border={BORDER_SIMPLE}>
        <VStack gap="4">
          <Heading color="h1Text" align="center" size="64">
            TOP 🔥 Users
          </Heading>

          <Text align="center" size="18">
            Find out your place in the top.
          </Text>
        </VStack>
      </Box>
    ),
    intents,
  })
})

app.frame('/next', async c => {
  const { appTitle, appShareUrl } = await configureApp(app, c)
  const message = encodeURIComponent(`What's your place in the 🔥 top?`)
  const buttonUrl = `https://warpcast.com/~/compose?text=${message}&embeds[]=${appShareUrl}`

  const offset = c.buttonValue ? Number(c.buttonValue) : 0
  const count = 8
  const nextOffset = offset + count
  let users = []
  try {
    users = (await (await fetch(`https://api.fifire.xyz/v1/user/top?offset=${offset}&count=${count}`)).json()).users
  } catch (e) {
    /* empty */
  }

  return c.res({
    title: appTitle,
    image: (
      <Box grow alignVertical="center" backgroundColor="white" padding="32" border={BORDER_SIMPLE}>
        <VStack gap="4">
          {users.length > 0 &&
            users.map((user, index) => (
              <Text align="left" size="20">
                {(offset + index + 1).toString()}. {user.username} - 🔥 {user.balance}
              </Text>
            ))}
        </VStack>
      </Box>
    ),
    intents: [
      <Button value={nextOffset.toString()} action="/next">
        Next
      </Button>,
      <Button.Link href={buttonUrl}>🔗 Share</Button.Link>,
      <Button action="/authorize">Save List</Button>,
    ],
  })
})

app.frame('/authorize', async c => {
  const { appTitle, userMainAddress, appAuthUrl, appPk, dappyKit, messageBytes, appAddress } = await configureApp(
    app,
    c,
  )
  const userDelegatedAddress = await kvGetDelegatedAddress(userMainAddress)
  const isCheckStatus = c.buttonValue === 'check-status'
  let intents = []
  let text = ''
  let errorText = ''
  let response

  if (userDelegatedAddress) {
    text = '✅ Done!'
    intents = [<Button action={'/'}>OK</Button>]
    try {
      await dappySaveData(
        dappyKit,
        appAddress,
        userMainAddress,
        await (await fetch(`https://api.fifire.xyz/v1/user/top?offset=0&count=10`)).text(),
      )
    } catch (e) {
      /* ignore */
    }
  } else {
    if (isCheckStatus) {
      text = `⏳ Waiting...`
      intents = [
        <Button value="check-status" action="/authorize">
          🔁 Check Status
        </Button>,
        <Button.Reset>🏠 Home</Button.Reset>,
      ]
    } else {
      try {
        const appSigner = accountToSigner(privateKeyToAccount(appPk))
        const userDelegatedMnemonic = generateMnemonic(english)
        const userDelegatedWallet = mnemonicToAccount(userDelegatedMnemonic)
        response = await dappyKit.farcasterClient.createAuthRequest(
          messageBytes,
          userDelegatedWallet.address,
          appSigner,
        )

        if (response.status !== 'ok') {
          throw new Error(`Invalid auth response status. ${JSON.stringify(response)}`)
        }

        await kvPutMnemonic(userDelegatedWallet.address, userDelegatedMnemonic)
      } catch (e) {
        const error = (e as Error).message
        console.log('Auth request error', error) // eslint-disable-line no-console
        errorText = `Error: ${error}`
      }

      text = `⚠️Click "Authorize" and enter the number ${response?.answer}.`
      intents = [
        <Button.Link href={appAuthUrl}>🐙 Authorize</Button.Link>,
        <Button value="check-status" action="/authorize">
          🔁 Check Status
        </Button>,
      ]
    }
  }

  return c.res({
    title: appTitle,
    image: (
      <Box grow alignVertical="center" backgroundColor="white" padding="32" border={BORDER_SIMPLE}>
        <VStack gap="4">
          <Heading color="h1Text" align="center" size="48">
            {errorText && 'Error'}
            {!errorText && text}
          </Heading>

          <Text align="center" size="18">
            {errorText && `Error: ${errorText}`}
          </Text>
        </VStack>
      </Box>
    ),
    intents,
  })
})

// @ts-ignore Vercel info
const isEdgeFunction = typeof EdgeFunction !== 'undefined'
const isProduction = isEdgeFunction || import.meta.env?.MODE !== 'development'

console.log('isProduction', isProduction) // eslint-disable-line no-console

if (!isProduction) {
  devtools(app, isProduction ? { assetsPath: '/.frog' } : { serveStatic })
}

export const GET = handle(app)
export const POST = handle(app)
