class Game {

    constructor(config = {}) {
        this.phaserConfig = {
            type: Phaser.AUTO,
            parent: config.id ? config.id : "game",
            width: config.width ? config.width : 800,
            height: config.height ? config.height : 600,
            scene: {
                key: "default",
                init: this.initScene,
                preload: this.preloadScene,
                create: this.createScene,
                update: this.updateScene
            }
        };

        this.client = stitch.Stitch.initializeDefaultAppClient(config.stitchAppId);
        this.database = this.client.getServiceClient(stitch.RemoteMongoClient.factory, "mongodb-atlas").db(config.databaseName);
        this.collection = this.database.collection(config.collectionName);
    }

    initScene(data) {
        this.collection = data.collection;
        this.authId = data.authId;
        this.gameId = data.gameId;
        this.ownerId = data.ownerId;
        this.strokes = data.strokes;
        this.points = [];
    }

    async preloadScene() {}

    async createScene() {
        this.graphics = this.add.graphics();
        this.graphics.lineStyle(4, 0x00aa00);
        this.strokes.forEach(stroke => {
            for(let i = 0; i < stroke.length; i++) {
                if(i == 0) {
                    this.path = new Phaser.Curves.Path(stroke[0][0], stroke[0][1]);
                } else {
                    this.path.lineTo(stroke[i][0], stroke[i][1]);
                }
            }
            this.path.draw(this.graphics);
        });
        const stream = await this.collection.watch({ "fullDocument._id": this.gameId });
        stream.onNext(event => {
            let updatedFields = event.updateDescription.updatedFields;
            if(updatedFields.hasOwnProperty("strokes")) {
                updatedFields = [updatedFields.strokes["0"]];
            }
            for(let strokeNumber in updatedFields) {
                for (let i = 0; i < updatedFields[strokeNumber].length; i++) {
                    if (i == 0) {
                        this.path = new Phaser.Curves.Path(updatedFields[strokeNumber][0][0], updatedFields[strokeNumber][0][1]);
                    } else {
                        this.path.lineTo(updatedFields[strokeNumber][i][0], updatedFields[strokeNumber][i][1]);
                    }
                }
                this.path.draw(this.graphics);
            }
        });
    }

    updateScene() {
        if(this.authId == this.ownerId) {
            if(!this.input.activePointer.isDown && this.points.length > 0) {
                this.collection.updateOne(
                    { 
                        "owner_id": this.authId,
                        "_id": this.gameId
                    },
                    {
                        "$push": {
                            "strokes": this.points
                        }
                    }
                ).then(result => console.log(result));
                this.points = [];
            }
            if(this.input.activePointer.isDown) {
                if(this.points.length == 0) {
                    this.path = new Phaser.Curves.Path(this.input.activePointer.position.x - 2, this.input.activePointer.position.y - 2);
                } else {
                    this.path.lineTo(this.input.activePointer.position.x - 2, this.input.activePointer.position.y - 2);
                }
                this.points.push([this.input.activePointer.position.x - 2, this.input.activePointer.position.y - 2]);
                this.path.draw(this.graphics);
            }
        }
    }

    async authenticate() {
        return this.client.auth.loginWithCredential(new stitch.AnonymousCredential());
    }

    async joinOrCreateGame(id) {
        try {
            let auth = await game.authenticate();
            let result = await game.joinGame(id, auth.id);
            if (result == null) {
                result = await game.createGame(id, auth.id);
            }
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    async joinGame(id, authId) {
        try {
            let result = await this.collection.findOne({ "_id": id });
            if(result != null) {
                this.game = new Phaser.Game(this.phaserConfig);
                this.game.scene.start("default", { 
                    "gameId": id,
                    "collection": this.collection,
                    "authId": authId,
                    "ownerId": result.owner_id,
                    "strokes": result.strokes
                });
            }
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    async createGame(id, authId) {
        try {
            let game = await this.collection.insertOne({
                "_id": id,
                "owner_id": authId,
                "strokes": [],
                "solved": false
            });
            this.game = new Phaser.Game(this.phaserConfig);
            this.game.scene.start("default", {
                "gameId": id,
                "collection": this.collection,
                "authId": authId,
                "ownerId": authId,
                "strokes": []
            });
            return { "gameId": id, "authId": authId, "owner_id": authId };
        } catch (e) {
            console.error(e);
        }
    }

}