# Robo-Valentine

Discord bot for quickly getting Skullgirls frame data. Successor to Liam's
Robo-Fortune bot (aka. FDBot).

Written in TypeScript with discord.js.

## How to add to your server

Robo-Valentine is a public bot, so you no longer need to contact a bot
maintainer to have it added to your server.

TODO

## How to use the bot

```
/fd character movename
``` 

e.g.

```
/fd filia H updo
```

## Where is the data hosted?

Currently hosted as a Google sheet -
[Read-only link to bot data spreadsheet](https://docs.google.com/spreadsheets/d/1WinMvGxS65707Uh2C0-VmDwXVTdav-DEI29j4OyJWXw/edit?usp=sharing). 
If you want edit access, contact SeaJay.

You can make the bot point at a different source by editing (TODO - config
file).

If the link above is dead because of Google link rot, there are Excel backups
available in the `backups/` folder in this repository. You can download one of
those and upload it as a new Google Sheet, then point your bot towards that. I
also encourage you to make your own backups of the current live version,
especially ones that don't rely on Google or other cloud services.

## How to host and run the bot yourself on your own machine

TODO

You'll need git, NodeJS, and npm.

```
git clone https://github.com/hugh-braico/robo-valentine.git
npm i
TODO configure secrets
TODO run command
```

## Using this repository as a template to write your own

Don't, I have no idea how to write Discord bots and this is all ad-hoc garbage.

## TODO list

- Split every character's data into their own sheet
- Basic bot that responds to slash commands
- Can post a dummy embed that is formatted correctly in response to a slash command
	- Make sure other users can also see the output, not just yourself
- Pull sheets (!download) using google sheets API to store to in-memory database
	- https://www.twilio.com/blog/2017/02/an-easy-way-to-read-and-write-to-a-google-spreadsheet-in-python.html
	- Format checking
	- Error reporting in the discord reply
- Basic query parsing
	- Make sure Big Band, Ms. Fortune, and Black Dahlia all parse correctly (two-word names)
- Rudimentary support for query error reporting (just saying contact SeaJay is OK for now)
- MACRO_ support
- Regex support (use `/alias/` to format an alias as regex)
- Fuzzy match support
- Public bot access